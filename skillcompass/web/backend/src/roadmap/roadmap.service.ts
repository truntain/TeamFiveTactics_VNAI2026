import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import axios from 'axios';

@Injectable()
export class RoadmapService {
  private readonly logger = new Logger(RoadmapService.name);
  private readonly prisma: PrismaClient;
  private getRoadmapUrl(): string {
    const raw = process.env.ROADMAP_SERVICE_URL || 'http://localhost:8003/generate-roadmap';
    return raw.endsWith('/generate-roadmap') ? raw : `${raw.replace(/\/+$/, '')}/generate-roadmap`;
  }

  constructor() {
    const connStr = process.env.DATABASE_URL || '';
    const pool = new Pool({
      connectionString: connStr,
      ssl: connStr.includes('sslmode=') || connStr.includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
    });
    const adapter = new PrismaPg(pool);
    this.prisma = new PrismaClient({ adapter });
  }

  async generateRoadmap(input: any) {
    // Trích xuất sessionId từ input linh hoạt
    let sessionId = '';
    if (typeof input === 'string') {
      sessionId = input;
    } else if (input && typeof input === 'object') {
      sessionId = input.session_id || input.sessionId || (input.user_profile && typeof input.user_profile === 'object' ? input.user_profile.session_id : '') || (typeof input.user_profile === 'string' ? input.user_profile : '');
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!sessionId || !uuidRegex.test(sessionId)) {
      this.logger.error(`Invalid session ID format: ${sessionId}`);
      throw new HttpException('Session ID phải đúng định dạng UUID v4.', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`Generating roadmap for session: ${sessionId}`);

    // 1. Lấy UserProfile từ DB
    const userProfile = await this.prisma.userProfile.findUnique({
      where: { session_id: sessionId },
    });

    if (!userProfile) {
      this.logger.error(`No user profile found for session: ${sessionId}`);
      throw new HttpException(
        'Không tìm thấy hồ sơ năng lực của học sinh cho phiên này.',
        HttpStatus.NOT_FOUND,
      );
    }

    // 2. Lấy lịch sử hội thoại từ DB
    const messages = await this.prisma.conversationMessage.findMany({
      where: { session_id: sessionId },
      orderBy: { created_at: 'asc' },
    });

    const conversationHistory = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // 3. Chuẩn bị payload gửi cho Agent 3
    const traitScores = userProfile.trait_scores as Record<string, any> || {};
    const marketExpectations = traitScores.market_expectations || {};
    
    const cleanCoreScores: Record<string, number> = {};
    const defaultTraits = [
      'adaptability_resilience',
      'analytical_thinking',
      'continuous_learning',
      'creativity_innovation',
      'critical_thinking',
      'effective_communication',
      'problem_solving',
      'responsibility_autonomy',
      'team_collaboration',
      'work_ethics_integrity',
    ];
    for (const trait of defaultTraits) {
      cleanCoreScores[trait] = typeof traitScores[trait] === 'number' ? traitScores[trait] : 5.0;
    }

    const preferredLocations = marketExpectations.preferred_locations || [];
    const expectedSalaryMin = marketExpectations.expected_salary_min || 0;
    const willingToRelocate = marketExpectations.willing_to_relocate || false;
    const familySupport = marketExpectations.family_support || null;
    const healthIssues = marketExpectations.health_issues || null;

    const payload = {
      user_profile: {
        core_scores: cleanCoreScores,
        market_expectations: {
          preferred_locations: preferredLocations,
          expected_salary_min: expectedSalaryMin,
          willing_to_relocate: willingToRelocate,
          family_support: familySupport,
          health_issues: healthIssues,
        },
      },
      conversation_history: conversationHistory,
    };

    // 4. Gọi Python Roadmap Microservice
    try {
      const targetUrl = this.getRoadmapUrl();
      this.logger.log(`Calling Python Roadmap API at ${targetUrl}...`);
      const response = await axios.post(targetUrl, payload);

      const roadmapData = response.data;

      // 5. Lưu kết quả Roadmap vào PostgreSQL
      await this.prisma.roadmap.upsert({
        where: { session_id: sessionId },
        update: {
          user_profile_summary: roadmapData.user_profile_summary,
          paths: roadmapData.paths,
          disclaimer: roadmapData.disclaimer,
          generated_at: new Date(),
        },
        create: {
          session_id: sessionId,
          user_profile_summary: roadmapData.user_profile_summary,
          paths: roadmapData.paths,
          disclaimer: roadmapData.disclaimer,
        },
      });

      this.logger.log(`Successfully generated and saved roadmap for session: ${sessionId}`);
      // Kèm trait_scores để FE hiển thị đủ 10 năng lực cốt lõi
      return { ...roadmapData, trait_scores: cleanCoreScores };
    } catch (error) {
      this.logger.error(`Failed to generate roadmap from Python service: ${error.message}`);
      
      // Fallback mock nếu Python service bị lỗi/chưa bật
      this.logger.warn('Returning mock fallback roadmap due to API failure.');

      // Tính match_score từ điểm thực tế (thang 0-10 → 0-100%)
      const avgScore = (keys: string[], weights?: number[]) => {
        const vals = keys.map((k, i) => {
          const s = cleanCoreScores[k] || 5.0;
          return weights ? s * (weights[i] || 1) : s;
        });
        const total = weights ? weights.reduce((a, b) => a + b, 0) : keys.length;
        const weighted = vals.reduce((a, b) => a + b, 0);
        return Math.round((weighted / total) * 10); // scale lên 0-100
      };

      const swScore = avgScore(
        ['analytical_thinking', 'problem_solving', 'critical_thinking', 'continuous_learning'],
        [1.5, 1.5, 1, 1]
      );
      const daScore = avgScore(
        ['analytical_thinking', 'critical_thinking', 'effective_communication'],
        [2, 1.5, 0.5]
      );
      const qaScore = avgScore(
        ['responsibility_autonomy', 'work_ethics_integrity', 'problem_solving'],
        [1.5, 1, 1]
      );

      return {
        user_profile_summary: 'Học sinh có thiên hướng tư duy phân tích và kỹ thuật cao.',
        trait_scores: cleanCoreScores,
        paths: [
          {
            path_id: 1,
            track_type: 'academic',
            career_track: 'Kỹ sư phần mềm',
            match_score: swScore,
            why_it_fits: 'Phù hợp với thế mạnh tư duy độc lập và kỹ năng phân tích logic.',
            role_progression: [
              { level: 'Junior', title: 'Junior Software Engineer', description: 'Xây dựng tính năng và kiểm thử' },
              { level: 'Mid', title: 'Software Engineer', description: 'Thiết kế module và tối ưu hệ thống' },
              { level: 'Senior', title: 'Tech Lead', description: 'Dẫn dắt kỹ thuật và mentoring' },
            ],
            skill_tree: { fundamentals: ['Thuật toán', 'Cấu trúc dữ liệu', 'Git'], core_technologies: ['Python/TypeScript', 'REST API', 'SQL'], advanced_skills: ['Cloud AWS/GCP', 'Microservices', 'CI/CD'] },
          },
          {
            path_id: 2,
            track_type: 'vocational',
            career_track: 'Nhà phân tích dữ liệu (Data Analyst)',
            match_score: daScore,
            why_it_fits: 'Phù hợp với khả năng tư duy số liệu và nhận diện xu hướng.',
            role_progression: [
              { level: 'Junior', title: 'Junior Data Analyst', description: 'Trực quan hóa dữ liệu và báo cáo' },
              { level: 'Mid', title: 'Data Analyst', description: 'Phân tích A/B test và xây dựng dashboard' },
              { level: 'Senior', title: 'Senior Data Analyst / BI Lead', description: 'Định hướng chiến lược dữ liệu' },
            ],
            skill_tree: { fundamentals: ['SQL', 'Excel/Google Sheets', 'Thống kê cơ bản'], core_technologies: ['Python Pandas', 'Power BI / Tableau', 'Google Analytics'], advanced_skills: ['Machine Learning cơ bản', 'Data Pipeline', 'Looker Studio'] },
          },
          {
            path_id: 3,
            track_type: 'vocational',
            career_track: 'Kỹ sư kiểm thử phần mềm (QA Engineer)',
            match_score: qaScore,
            why_it_fits: 'Tương thích với khả năng chú ý đến chi tiết và tư duy hệ thống.',
            role_progression: [
              { level: 'Junior', title: 'QA Tester', description: 'Viết test case và kiểm thử thủ công' },
              { level: 'Mid', title: 'QA Engineer', description: 'Tự động hóa kiểm thử với Selenium/Playwright' },
              { level: 'Senior', title: 'QA Lead / SDET', description: 'Xây dựng framework kiểm thử toàn diện' },
            ],
            skill_tree: { fundamentals: ['Test Case Design', 'Bug Reporting', 'Agile/Scrum'], core_technologies: ['Selenium / Playwright', 'Postman', 'JIRA'], advanced_skills: ['CI/CD Testing', 'Performance Testing', 'Security Testing'] },
          },
        ],
        disclaimer: 'Lộ trình được tổng hợp dựa trên hồ sơ năng lực AI đánh giá.',
      };
    }
  }

  async getTrends(region?: string) {
    try {
      // 1. Map region name to DB key
      let dbRegion = 'HCM'; // default fallback
      if (region) {
        const rNorm = region.toLowerCase();
        if (rNorm.includes('hà nội') || rNorm.includes('hn')) {
          dbRegion = 'HN';
        } else if (rNorm.includes('hồ chí minh') || rNorm.includes('hcm') || rNorm.includes('sài gòn')) {
          dbRegion = 'HCM';
        } else if (rNorm.includes('đà nẵng') || rNorm.includes('dn')) {
          dbRegion = 'HN'; // Fallback key
        }
      }

      // 2. Fetch all career tracks
      const careers = await this.prisma.careerTrack.findMany();

      const parseGrowthRate = (val: any): number => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        const str = String(val).replace(/%/g, '').trim();
        const num = parseFloat(str);
        return isNaN(num) ? 0 : num;
      };

      // 3. Process categories
      const targetCategories = [
        {
          name: 'Công nghệ thông tin',
          displayName: 'Công nghệ Thông tin',
          gradient: 'linear-gradient(135deg, #0260FF 0%, #00C6FF 100%)',
        },
        {
          name: 'Kinh doanh & Bán hàng',
          displayName: 'Marketing & Kinh doanh',
          gradient: 'linear-gradient(135deg, #FF9900 0%, #FF5E62 100%)',
        },
        {
          name: 'Cơ khí & Tự động hóa',
          displayName: 'Cơ khí & Tự động hóa',
          gradient: 'linear-gradient(135deg, #7F00FF 0%, #E100FF 100%)',
        },
      ];

      const topIndustries = targetCategories.map((cat) => {
        const catCareers = careers.filter(
          (c) =>
            c.track_type.toLowerCase().includes(cat.name.toLowerCase()) ||
            cat.name.toLowerCase().includes(c.track_type.toLowerCase()),
        );

        // Sort by growth rate of the selected region
        const sortedJobs = catCareers
          .map((c) => {
            const signals = (c.local_demand_signals as any) || {};
            const regionData = signals[dbRegion] || signals['HCM'] || signals['HN'] || {};
            const growth = parseGrowthRate(regionData.growth_rate);
            return {
              name: c.career_track,
              growth,
            };
          })
          .sort((a, b) => b.growth - a.growth);

        const previewJobs = sortedJobs.slice(0, 3).map((j) => j.name);
        const allCategoryJobs = sortedJobs.map((j) => j.name);

        // If not enough jobs from DB, fallback with defaults
        const fallbackJobsMap: Record<string, string[]> = {
          'Công nghệ thông tin': ['AI Lead', 'Kỹ sư phân tích dữ liệu (Analytics Engineer)', 'Chuyên viên An ninh mạng', 'Kỹ sư Dữ liệu', 'An toàn Thông tin'],
          'Kinh doanh & Bán hàng': ['Chuyên viên Kinh doanh GPS', 'Chuyên viên Phát triển Kinh doanh Năng lượng Mặt trời', 'Nhân viên Phát triển Thị trường (Sàn TMĐT)', 'Digital Marketing', 'Phân tích Kinh doanh', 'Quản trị Sản phẩm'],
          'Cơ khí & Tự động hóa': ['Nhân viên Điều phối Dự án', 'Kỹ sư thiết kế cơ khí', 'Kỹ thuật viên Cơ điện', 'Kỹ sư Cơ khí', 'Kỹ thuật viên Phay CNC', 'Vận hành Robot'],
        };
        const finalJobs = previewJobs.length >= 2 ? previewJobs : fallbackJobsMap[cat.name].slice(0, 3);
        const finalAllJobs = allCategoryJobs.length >= 2 ? allCategoryJobs : fallbackJobsMap[cat.name];

        return {
          title: cat.displayName,
          gradient: cat.gradient,
          jobs: finalJobs,
          allJobs: finalAllJobs,
        };
      });

      // 4. Process Rising and Falling careers
      const careersWithSignals = careers.map((c) => {
        const signals = (c.local_demand_signals as any) || {};
        const regionData = signals[dbRegion] || signals['HCM'] || signals['HN'] || {};
        const growth = parseGrowthRate(regionData.growth_rate);
        return {
          name: c.career_track,
          field: c.track_type,
          growth,
        };
      });

      const rising = [...careersWithSignals]
        .sort((a, b) => b.growth - a.growth)
        .slice(0, 4)
        .map((c) => ({ n: c.name, field: c.field }));

      const falling = [...careersWithSignals]
        .filter(c => c.growth > 0)
        .sort((a, b) => a.growth - b.growth)
        .slice(0, 4)
        .map((c) => ({ n: c.name, field: c.field }));

      const defaultFalling = [
        { n: 'Nhân viên Bưu chính', field: 'Vận tải & Logistics' },
        { n: 'Kế toán sơ cấp', field: 'Tài chính' },
        { n: 'Quản lý kho thủ công', field: 'Sản xuất' },
        { n: 'Nhân viên giáo vụ', field: 'Giáo dục & Đào tạo' }
      ];
      const finalFalling = falling.length >= 2 ? falling : defaultFalling;

      return {
        success: true,
        region: dbRegion,
        topIndustries,
        regionalTrends: {
          rising: rising.length >= 2 ? rising : [
            { n: 'Kỹ sư Phần mềm', field: 'Công nghệ Thông tin' },
            { n: 'Chuyên viên SEO', field: 'Marketing' },
            { n: 'Phân tích Dữ liệu', field: 'Dữ liệu & Kinh doanh' }
          ],
          falling: finalFalling,
        },
      };
    } catch (error) {
      this.logger.error(`Error fetching trends: ${error.message}`);
      throw new HttpException('Lỗi khi lấy dữ liệu xu hướng thị trường.', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getCareerDetail(name: string) {
    try {
      if (!name) {
        throw new HttpException('Tên ngành không được để trống.', HttpStatus.BAD_REQUEST);
      }
      const career = await this.prisma.careerTrack.findFirst({
        where: {
          career_track: {
            equals: name,
            mode: 'insensitive',
          },
        },
        include: {
          role_progressions: {
            orderBy: {
              sort_order: 'asc',
            },
          },
          skill_trees: true,
        },
      });

      if (!career) {
        throw new HttpException('Không tìm thấy thông tin ngành này.', HttpStatus.NOT_FOUND);
      }

      // Format skill trees into categories
      const fundamentals: string[] = [];
      const core_technologies: string[] = [];
      const advanced_skills: string[] = [];

      career.skill_trees.forEach((st) => {
        if (st.category === 'fundamentals') {
          fundamentals.push(st.skill_name);
        } else if (st.category === 'core_technologies') {
          core_technologies.push(st.skill_name);
        } else if (st.category === 'advanced_skills') {
          advanced_skills.push(st.skill_name);
        }
      });

      return {
        success: true,
        career_track: career.career_track,
        track_type: career.track_type,
        description: career.description,
        avg_salary_min: career.avg_salary_min,
        avg_salary_max: career.avg_salary_max,
        education_route: career.education_route,
        typical_employers: career.typical_employers,
        local_demand_signals: career.local_demand_signals,
        role_progression: career.role_progressions.map((rp) => ({
          level: rp.level,
          title: rp.title,
          description: rp.description,
        })),
        skill_tree: {
          fundamentals,
          core_technologies,
          advanced_skills,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Error fetching career detail: ${error.message}`);
      throw new HttpException('Lỗi khi lấy chi tiết ngành học.', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}



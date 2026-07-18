import React, { useState, useEffect } from 'react';
import { View } from '../types';
import { Loader2 } from 'lucide-react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://teamfivetactics-vnai2026-1.onrender.com';

function ResultsView({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [expandedIndices, setExpandedIndices] = useState<number[]>([]);
  const [roadmapData, setRoadmapData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchRoadmap = async () => {
      setIsLoading(true);
      try {
        const sid = typeof window !== 'undefined' ? (sessionStorage.getItem('skillcompass_session_id') || 'session_default') : 'session_default';
        const res = await fetch(`${BACKEND_URL}/api/career/roadmap`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sid }),
        });
        const data = await res.json();
        setRoadmapData(data);
      } catch (err) {
        console.error('Error fetching roadmap:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRoadmap();
  }, []);

  const toggleExpand = (index: number) => {
    setExpandedIndices(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const defaultRecommendedJobs = [
    {
      title: 'Kỹ sư giải pháp phần mềm',
      score: 92,
      why_it_fits: 'Phù hợp với thế mạnh tư duy phân tích logic và sáng tạo của bạn.',
      skills: ['Lập trình Python/TypeScript', 'Kiến trúc phần mềm', 'Truy vấn SQL', 'Giao tiếp & Đàm phán', 'Điện toán đám mây Cloud']
    },
    {
      title: 'Quản lý Sản phẩm (Product Manager)',
      score: 86,
      why_it_fits: 'Tương thích cao với kỹ năng giải quyết vấn đề và định hướng thị trường.',
      skills: ['Quản lý dự án Agile/Scrum', 'Phân tích yêu cầu', 'Thiết kế trải nghiệm UX/UI', 'Tư duy chiến lược']
    },
  ];

  const paths = roadmapData?.paths || [];

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAFA', padding: '64px 48px', fontFamily: '"Google Sans Flex", sans-serif' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <h2 style={{ fontWeight: 500, fontSize: '32px', lineHeight: '36px', color: '#06040E', marginBottom: '24px' }}>
          Lộ trình Sự nghiệp Đề xuất của Bạn
        </h2>

        {isLoading ? (
          <div className="gemini-card" style={{ borderRadius: '20px', padding: '64px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <Loader2 className="animate-spin" size={36} color="#0260FF" />
            <h3 style={{ fontWeight: 500, fontSize: '20px', color: '#06040E' }}>Đang tổng hợp lộ trình từ AI & cơ sở dữ liệu...</h3>
            <p style={{ color: '#5F6368', fontSize: '16px' }}>Vui lòng đợi trong giây lát.</p>
          </div>
        ) : (
          <>
            {roadmapData?.user_profile_summary && (
              <div className="gemini-card" style={{ borderRadius: '20px', padding: '24px 32px', marginBottom: '32px', background: '#F0F4FF', border: '1px solid rgba(2,96,255,0.1)' }}>
                <h4 style={{ fontWeight: 500, fontSize: '18px', color: '#0260FF', marginBottom: '8px' }}>Tổng quan Hồ sơ Năng lực</h4>
                <p style={{ fontSize: '16px', lineHeight: '24px', color: '#06040E' }}>{roadmapData.user_profile_summary}</p>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '32px', alignItems: 'start' }}>
              {/* Competency Summary */}
              <div className="gemini-card" style={{ borderRadius: '20px', padding: '32px' }}>
                <h3 className="gemini-gradient-text" style={{ fontWeight: 500, fontSize: '20px', lineHeight: '24px', marginBottom: '24px' }}>Năng lực Cốt lõi</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {[{ n: 'Tư duy Logic', v: 92 }, { n: 'Sáng tạo', v: 84 }, { n: 'Thích ứng', v: 88 }].map(s => (
                    <div key={s.n}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#06040E', fontWeight: 400, fontSize: '15px' }}>
                        <span>{s.n}</span> <span style={{ color: '#0260FF', fontWeight: 500 }}>{s.v}%</span>
                      </div>
                      <div style={{ height: '6px', borderRadius: '3px', background: '#F0F4FF' }}>
                        <div style={{ height: '6px', borderRadius: '3px', background: 'linear-gradient(53deg, #0260FF, #40A2FF)', width: `${s.v}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Jobs List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {paths.length > 0 ? (
                  paths.map((path: any, i: number) => {
                    const title = path.career_track || 'Ngành nghề';
                    const score = path.match_score || 85;
                    const whyFits = path.why_it_fits;
                    const skillTree = path.skill_tree || {};
                    const allSkills = [
                      ...(skillTree.fundamentals || []),
                      ...(skillTree.core_technologies || []),
                      ...(skillTree.advanced_skills || []),
                    ];

                    return (
                      <div key={i} className="gemini-card" style={{
                        borderRadius: '20px', padding: '32px',
                        display: 'flex', flexDirection: 'column', transition: 'all 0.3s'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1, paddingRight: '16px' }}>
                            <h4 style={{ fontWeight: 500, fontSize: '24px', lineHeight: '28px', color: '#06040E', marginBottom: '8px' }}>{title}</h4>
                            {whyFits && <p style={{ fontSize: '15px', color: '#5F6368', marginBottom: '16px', lineHeight: '22px' }}>{whyFits}</p>}
                            <button
                              onClick={() => toggleExpand(i)}
                              className="gemini-pill" style={{ height: '40px', padding: '0 20px', borderRadius: '20px', border: '1px solid rgba(0,0,0,0.1)', fontWeight: 500, fontSize: '15px', color: '#06040E', background: expandedIndices.includes(i) ? '#F0F4FF' : '#FFFFFF', cursor: 'pointer', margin: 0, transition: 'all 0.2s' }}>
                              {expandedIndices.includes(i) ? 'Thu gọn' : 'Xem lộ trình kỹ năng chi tiết'}
                            </button>
                          </div>
                          <div style={{ textAlign: 'right', minWidth: '100px' }}>
                            <div className="gemini-gradient-text" style={{ fontWeight: 500, fontSize: '36px', lineHeight: '40px' }}>{score}%</div>
                            <p style={{ fontWeight: 700, fontSize: '12px', color: 'rgba(0,0,0,0.5)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>Độ phù hợp</p>
                          </div>
                        </div>

                        {/* Expandable Skills & Progression Section */}
                        {expandedIndices.includes(i) && (
                          <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                            {allSkills.length > 0 && (
                              <div style={{ marginBottom: '20px' }}>
                                <h5 style={{ fontWeight: 500, fontSize: '16px', color: '#06040E', marginBottom: '12px' }}>Kỹ năng trọng tâm cần trang bị:</h5>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                  {allSkills.map((skill: string) => (
                                    <span key={skill} style={{ background: '#F8F9FA', padding: '8px 16px', borderRadius: '16px', fontSize: '14px', color: '#0260FF', border: '1px solid rgba(2,96,255,0.1)' }}>
                                      {skill}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {path.role_progression && path.role_progression.length > 0 && (
                              <div>
                                <h5 style={{ fontWeight: 500, fontSize: '16px', color: '#06040E', marginBottom: '12px' }}>Lộ trình thăng tiến vị trí:</h5>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                  {path.role_progression.map((step: any, idx: number) => (
                                    <div key={idx} style={{ background: '#FAFBFD', padding: '12px 16px', borderRadius: '12px', borderLeft: '3px solid #0260FF' }}>
                                      <div style={{ fontWeight: 500, fontSize: '15px', color: '#06040E' }}>
                                        <span style={{ color: '#0260FF', marginRight: '8px' }}>[{step.level || 'Cấp độ'}]</span>
                                        {step.title}
                                      </div>
                                      {step.description && <div style={{ fontSize: '13px', color: '#5F6368', marginTop: '4px' }}>{step.description}</div>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  defaultRecommendedJobs.map((j, i) => (
                    <div key={i} className="gemini-card" style={{ borderRadius: '20px', padding: '32px' }}>
                      <h4 style={{ fontWeight: 500, fontSize: '24px', color: '#06040E', marginBottom: '8px' }}>{j.title}</h4>
                      <p style={{ fontSize: '15px', color: '#5F6368', marginBottom: '16px' }}>{j.why_it_fits}</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {j.skills.map(s => (
                          <span key={s} style={{ background: '#F8F9FA', padding: '8px 16px', borderRadius: '16px', fontSize: '14px', color: '#5F6368' }}>{s}</span>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        <button className="gemini-pill" onClick={() => onNavigate('home')} style={{ marginTop: '48px', height: '56px', padding: '0 32px', borderRadius: '28px', border: '1px solid rgba(0,0,0,0.1)', fontWeight: 500, fontSize: '16px', color: '#06040E', background: '#FFFFFF', cursor: 'pointer' }}>Trở về Trang chủ</button>
      </div>
    </div>
  );
}

export default ResultsView;

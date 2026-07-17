# TÀI LIỆU KIẾN TRÚC TỔNG THỂ: SKILLCOMPASS - ADAPTIVE CAREER NAVIGATOR
*Bản thiết kế toàn diện (Final Master Document) cho Hackathon 48h*
*Kết hợp: Hồ sơ Tâm lý Ngầm (Implicit Profiling), Nhận diện Ngữ cảnh (Context-Aware) & Lộ trình Sự nghiệp (Career Roadmap)*

---

## 1. TỔNG QUAN GIẢI PHÁP (EXECUTIVE SUMMARY)

**SkillCompass** là một **Hệ sinh thái Hướng nghiệp Tự động** (Automated Career Guidance Ecosystem) linh hoạt, được cá nhân hóa hoàn toàn dựa trên thông tin thực tế của người dùng. Hệ thống giải quyết sự mơ hồ trong định hướng sự nghiệp thông qua 2 bước đột phá:

1. **Adaptive Implicit Profiling (Hồ sơ ngầm thích ứng):** Khác với chatbot rập khuôn, hệ thống **không yêu cầu học sinh tự dán nhãn hay chọn bối cảnh trước**. Thay vào đó, AI mở đầu bằng một câu hỏi trung lập duy nhất (*"Bạn đang ở giai đoạn nào trong hành trình của mình?"*) và tự suy luận context (cấp 3 / trường nghề / đại học) từ câu trả lời đầu tiên — rồi **im lặng thích ngọi phong cách hỏi** mà không bao giờ thông báo chân thực với người dùng. Học sinh luôn cảm thấy mình được lắng nghe, không bị xếp vào hộp.
2. **Multi-Path Career Roadmap Generation (Sinh Đa Lộ trình Sự nghiệp):** Áp dụng Agentic RAG để đối chiếu năng lực người dùng với dữ liệu thị trường (Job Descriptions và Vocational Market Data). Hệ thống **KHÔNG bao giờ chỉ ra duy nhất một con đường** — luôn xuất ra **tối thiểu 2-3 lộ trình song song** (gồm cả hướng nghề và hướng học thuật) kèm lý giải rõ ràng, để học sinh được quyền tự quyết định.

---

## 2. KIẾN TRÚC HỆ THỐNG TOÀN DIỆN (SYSTEM ARCHITECTURE)

```mermaid
graph TD
    subgraph Frontend [User Interface (Next.js)]
        Context[Context Selection: Highschool/College]
        ChatUI[Adaptive Chat UI]
        Roadmap[Interactive Career Roadmap & Skill Tree]
    end

    subgraph API Gateway [Backend (NestJS)]
        Auth[Custom JWT Auth]
        Router[API Router]
    end

    subgraph Multi-Agent Engine [LangChain / LlamaIndex]
        Agent1[Market Intelligence Agent]
        Agent2A[Adaptive Counselor Agent]
        Agent2B[Psychology/Skill Evaluator Agent]
        Agent3[Path Finder / Roadmap Agent]
    end

    subgraph Data Layer
        Postgres[(PostgreSQL)]
        VectorDB[(Pinecone / Qdrant)]
        Redis[(Redis Cache/Queue)]
    end

    Context --> ChatUI
    Frontend <--> API Gateway
    API Gateway <--> Multi-Agent Engine
    Agent1 --> VectorDB
    Agent1 --> Postgres
    Agent2A <--> User
    Agent2A --> Agent2B
    Agent2B --> Postgres
    Agent3 <--> VectorDB
    Agent3 --> Postgres
    Multi-Agent Engine <--> LLMs((OpenAI / Anthropic APIs))
```

---

## 3. THIẾT KẾ ĐA TÁC TỬ (MULTI-AGENT WORKFLOW)

### 3.1. Market Intelligence Agent (Background Process)
- **Nhiệm vụ:** Trích xuất Skills, Nhu cầu, và Mối quan hệ thăng tiến (Career Hierarchy) từ **cả hai nguồn dữ liệu**:
  - **Academic Track Data:** Job Descriptions từ các nền tảng tuyển dụng (LinkedIn, TopCV, VietnamWorks) cho các ngành cần bằng đại học.
  - **Vocational Track Data:** Tin tuyển dụng thợ lành nghề, dữ liệu lương thực tế từ ngành nghề kỹ thuật (điện, cơ khí, ô tô, F&B, du lịch, y tế trung cấp) + dữ liệu tuyển sinh trường nghề.
- **Output:** Dữ liệu thị trường được chuyển thành `Market Skill Vector` (cho cả 2 track) và Career Graph bao gồm **Vocational Progression** (thợ học việc → thợ lành nghề → tổ trưởng → quản lý kỹ thuật).

### 3.2. Adaptive Counselor Agent (User-facing)
- **Nhiệm vụ:** Trò chuyện với người dùng để lập hồ sơ ngầm. Hoạt động dựa trên **Guided Conversation State Machine** (Hội thoại định hướng theo trạng thái) kết hợp **Dynamic Deep-Dive** (Hỏi đào sâu).
- **Cơ chế hoạt động cốt lõi:**
  1. **Base Questionnaire Framework (Bộ khung định hướng):** Agent được trang bị sẵn một danh sách các nhóm tiêu chí bắt buộc phải thu thập (VD: *Động lực, Sở thích lõi, Khả năng chịu áp lực, Xu hướng làm việc nhóm*). Nó sẽ dùng danh sách này làm mỏ neo để dẫn dắt câu chuyện không bị lan man, đảm bảo luôn thu thập đủ dữ liệu cho User Profile JSON.
  2. **Dynamic Deep-Dive (Đào sâu ngữ cảnh phát sinh):** Dù có bộ khung, Agent KHÔNG hỏi như một bản khảo sát. Khi người dùng đưa ra một dữ kiện chung chung, Agent bắt buộc phải phân tích và khoét sâu để hiểu nguyên nhân. 
     - *Ví dụ:* User: "Em thấy em hợp với máy tính." → Agent sẽ không chuyển câu hỏi tiếp theo ngay, mà follow-up: *"Làm việc với máy tính rất rộng, em thường dùng máy tính để làm gì nhất? Chơi game chiến thuật, thiết kế ảnh, hay thích vọc vạch phần cứng? Cảm giác lúc đó của em thế nào?"*
  3. **Điều kiện dừng Đào sâu (Deep-Dive Stopping Criteria):** Để tránh việc AI hỏi lan man, tích tụ quá nhiều context không cần thiết và khiến người dùng bị mệt, hệ thống sử dụng cơ chế **Hard Turn Limit kết hợp Forced Transition (Giới hạn lượt và Ép bẻ lái)**:
     - **Phân biệt Trait Score và Confidence Score:** Cần lưu ý, hệ thống KHÔNG đào sâu để "ép" người dùng phải thể hiện ra một năng lực (VD: Ép họ phải bộc lộ tính Sáng tạo). Hệ thống đào sâu để tăng **Confidence Score** (Độ chắc chắn của AI về đánh giá của mình). Ví dụ: Sau 2 câu hỏi, AI nhận ra người dùng hoàn toàn làm việc rập khuôn và thiếu Sáng tạo → *Trait Score (Điểm Sáng tạo) = 2/10*, nhưng *Confidence Score (Độ chắc chắn) = 0.9*. Khi AI đã "chắc nịch" về con điểm 2/10 này, quá trình đào sâu sẽ lập tức dừng lại vì nó đã hoàn thành nhiệm vụ đánh giá.
     - **Dynamic Turn Limit (Giới hạn lượt hỏi 3-5 lượt):** Để đảm bảo đủ không gian, mỗi chủ đề Deep-dive kéo dài khoảng 3 lượt (Soft Limit). Tuy nhiên, bị chặn bởi một giới hạn cứng (Hard Limit) là tối đa 5 lượt. Dù Agent 2B chưa chắc chắn về đánh giá của mình (Confidence vẫn thấp), khi chạm mốc 5 lượt, Agent 2A bắt buộc phải dừng đào sâu để bảo vệ UX.
     - **Forced Synthesis & Transition (Đóng gói và Chuyển hướng):** Khi nhận được tín hiệu "Đã chắc chắn về đánh giá" từ Agent 2B HOẶC chạm trần giới hạn lượt, Agent 2A sẽ thực hiện: (1) Tóm tắt nhẹ nhàng câu trả lời để thể hiện sự thấu cảm, (2) Dùng câu nối khéo léo để dẫn người dùng sang nhóm tiêu chí tâm lý tiếp theo.
     - *Ví dụ Transition:* "À anh hiểu rồi, việc em tự mày mò sửa lỗi phần mềm chứng tỏ em có tính kiên nhẫn rất cao đấy! Sẵn tiện nói về tính kiên nhẫn, khi làm bài tập nhóm trên lớp mà có bạn không chịu làm, em thường xử lý thế nào?"
- **Cấu trúc 2 giai đoạn hội thoại:**
  - **Giai đoạn 1 — Context Discovery (2-3 lượt đầu):** AI mở đầu trung lập (*"Hiện tại bạn đang học ở đâu hay đang ở giai đoạn nào?"*). Dựa trên câu trả lời, Agent 2B **suy luận ngầm** context (cấp 3 / trường nghề / đại học / đi làm rồi muốn chuyển nghề) và **tự động cài System Prompt phù hợp** cho Agent 2A từ lượt sau — không hỏi lại, không để học sinh tự chọn nhãn.
  - **Giai đoạn 2 — Deep Profiling (Phần chính):** Sau khi biết context, AI tiến hành thu thập các nhóm tiêu chí theo Base Questionnaire Framework với phong cách thích hợp (tâm sự gần gũi nếu là học sinh cấp 3, thực chiến nếu là học sinh nghề, chuyên nghiệp nếu là sinh viên).

### 3.3. Evaluator Agent (Background Evaluator)
- **Nhiệm vụ:** Giám khảo ngầm (LLM-as-a-Judge) phân tích đoạn chat để cập nhật điểm thiên hướng (cho học sinh) hoặc kỹ năng thực chiến (cho sinh viên).
- **Cơ chế State Tracking (Theo dõi trạng thái):** Agent này đối chiếu liên tục với *Base Questionnaire Framework*. Khi một nhóm tiêu chí (VD: Teamwork) đạt đủ độ tin cậy (Confidence > 0.8), nó gửi tín hiệu ngầm báo Agent 2A chuyển sang thu thập nhóm tiêu chí khác. Khi đã thu thập đủ các nhóm, quá trình kết thúc và chuyển sang sinh Lộ trình.

### 3.4. Roadmap Agent (Core Decision Engine)
- **Nhiệm vụ:** So khớp `User Profile` với `Market Vector`. 
- **Output:** Trả ra dạng Cây Kỹ Năng (Skill Tree) và Lộ trình vị trí (Role Progression).

---

## 4. CẤU TRÚC DỮ LIỆU ĐẦU RA (CAREER ROADMAP JSON)

Hệ thống không sinh ra lịch trình thời gian (như 3 tháng học gì), mà sinh ra **đa lộ trình sự nghiệp song song** — luôn bao gồm **ít nhất 1 hướng học nghề (vocational)** và **ít nhất 1 hướng học thuật (academic)**. Học sinh được xem toàn bộ phổ lựa chọn và tự quyết định.

Khi truy vấn `GET /api/career/roadmap`, cấu trúc Output bắt buộc là:
```json
{
  "user_profile_summary": "Bạn có tư duy phân tích mạnh, thích làm việc độc lập với dữ liệu, chịu được áp lực cao và thích môi trường có quy trình rõ ràng.",

  "paths": [
    {
      "path_id": 1,
      "track_type": "academic",
      "career_track": "Data Science / Analytics",
      "education_route": "Đại học ngành CNTT, Toán Ứng dụng, hoặc Kinh tế",
      "match_score": 88,
      "why_it_fits": "Tư duy phân tích mạnh mẽ và thiên hướng làm việc với con số phù hợp trực tiếp với vai trò Data Analyst. Bạn đã thể hiện khả năng chịu áp lực cao và thích quy trình rõ ràng — đây là yêu cầu cốt lõi của nghề này.",
      "role_progression": [
        { "level": "Entry", "title": "Data Analyst Intern", "description": "Làm quen xử lý dữ liệu và báo cáo cơ bản." },
        { "level": "Mid", "title": "Senior Data Analyst", "description": "Phân tích xu hướng kinh doanh, làm việc với ban lãnh đạo." },
        { "level": "Advanced", "title": "Data Scientist / Analytics Manager", "description": "Xây dựng mô hình ML hoặc quản lý team." }
      ],
      "skill_tree": {
        "fundamentals": ["Toán Thống kê", "Tư duy phản biện", "Excel Nâng cao"],
        "core_technologies": ["SQL", "Python (Pandas, NumPy)", "PowerBI / Tableau"],
        "advanced_skills": ["Machine Learning (Scikit-learn)", "Data Warehousing", "A/B Testing"]
      }
    },
    {
      "path_id": 2,
      "track_type": "vocational",
      "career_track": "Kỹ thuật Tự động hóa / PLC",
      "education_route": "Cao đẳng nghề Điện - Tự động hóa (1.5-2 năm)",
      "match_score": 74,
      "why_it_fits": "Bạn thể hiện sở thích giải quyết vấn đề thực tế và khả năng tư duy logic cao. Ngành tự động hóa đang thiếu nhân lực nghiêm trọng tại các khu công nghiệp, mức lương thợ lành nghề cạnh tranh với kỹ sư mới ra trường.",
      "role_progression": [
        { "level": "Entry", "title": "Thợ vận hành máy / Kỹ thuật viên PLC", "description": "Vận hành và bảo trì dây chuyền sản xuất tự động." },
        { "level": "Mid", "title": "Kỹ thuật viên Tự động hóa Senior", "description": "Lập trình PLC, tối ưu quy trình sản xuất." },
        { "level": "Advanced", "title": "Trưởng phòng Kỹ thuật / Automation Engineer", "description": "Thiết kế hệ thống tự động hóa toàn dây chuyền." }
      ],
      "skill_tree": {
        "fundamentals": ["Điện cơ bản", "Đọc bản vẽ kỹ thuật", "An toàn lao động"],
        "core_technologies": ["PLC Siemens/Mitsubishi", "SCADA", "Cảm biến & Cơ cấu chấp hành"],
        "advanced_skills": ["Robotic Integration", "IoT Công nghiệp", "Chứng chỉ nghề Quốc tế"]
      }
    },
    {
      "path_id": 3,
      "track_type": "vocational",
      "career_track": "Kỹ thuật viên Phần mềm (Bootcamp Route)",
      "education_route": "Bootcamp lập trình 6 tháng hoặc Cao đẳng CNTT",
      "match_score": 70,
      "why_it_fits": "Nếu bạn muốn vào ngành công nghệ mà không muốn học 4 năm đại học, lộ trình bootcamp có thể đưa bạn đến vị trí Junior Developer trong vòng 6-12 tháng với chi phí thấp hơn nhiều.",
      "role_progression": [
        { "level": "Entry", "title": "Junior Web Developer", "description": "Phát triển tính năng front-end/back-end cơ bản." },
        { "level": "Mid", "title": "Mid-level Developer", "description": "Chủ trì module, review code, mentor junior." },
        { "level": "Advanced", "title": "Senior Developer / Tech Lead", "description": "Thiết kế kiến trúc hệ thống." }
      ],
      "skill_tree": {
        "fundamentals": ["HTML/CSS", "JavaScript cơ bản", "Git & GitHub"],
        "core_technologies": ["React hoặc Vue.js", "Node.js", "REST API"],
        "advanced_skills": ["System Design", "Docker/CI-CD", "Cloud Basics"]
      }
    }
  ],

  "disclaimer": "Các gợi ý trên được tạo ra dựa trên hồ sơ năng lực và sở thích của bạn kết hợp dữ liệu thị trường lao động thực tế. Đây là thông tin tham khảo — bạn hoàn toàn có quyền chọn bất kỳ hướng nào bạn thấy phù hợp nhất với giá trị và hoàn cảnh của bản thân."
}
```

---

## 5. CHIẾN LƯỢC ĐẠO ĐỨC & ANTI-BIAS (CHỐNG THIÊN KIẾN)

1. **Vocational Equality (Bình đẳng giá trị các con đường):** Hệ thống thiết kế giao diện, ngôn ngữ và thuật toán xếp hạng để **không ưu tiên hướng đại học hơn hướng nghề**. `match_score` được tính độc lập theo mức độ phù hợp thực tế — một lộ trình nghề có thể xếp hạng cao hơn lộ trình đại học nếu phù hợp hơn với hồ sơ học sinh.

2. **Bias Guard Prompt Constraint (Ràng buộc kỹ thuật chống định kiến):** Toàn bộ System Prompt của Roadmap Agent phải bao gồm ràng buộc cứng:
   - ❌ **Cấm tuyệt đối:** Không được gợi ý nghề nghiệp dựa trên giới tính, vùng miền, hay hoàn cảnh kinh tế của học sinh.
   - ✅ **Bắt buộc:** Luôn trả về tối thiểu 2-3 lộ trình đa dạng — trong đó **bắt buộc có ít nhất 1 vocational path** để đảm bảo học sinh luôn nhìn thấy lựa chọn thực tế ngoài con đường đại học.
   - ✅ **Bắt buộc:** `disclaimer` phải luôn có mặt trong mỗi output, khẳng định đây là tham khảo và học sinh có toàn quyền tự quyết.

3. **Multi-Path Output as Core Principle (Đa lộ trình là nguyên tắc cốt lõi):** Hệ thống **không bao giờ trả ra chỉ 1 con đường duy nhất**. Ngay cả khi học sinh có hồ sơ rất rõ ràng, hệ thống vẫn hiển thị các lộ trình thay thế với điểm phù hợp thấp hơn — kèm lý giải trung thực để học sinh hiểu tại sao đó là lựa chọn thứ hai/ba.

4. **Counterfactual Ranking:** Hệ thống luôn cung cấp cái nhìn thực tế về thị trường, không hứa hẹn phi lý. Kỹ năng liệt kê trong Skill Tree hoàn toàn lấy từ số liệu Job Description và Vocational Market Data thực tế, không lấy từ cảm tính.

5. **Explainable AI (XAI):** Gợi ý mỗi lộ trình luôn đi kèm `why_it_fits` giải thích rõ ràng căn cứ dựa trên **đặc điểm cá nhân cụ thể của học sinh**, không phải lý do chung chung.

---

## 6. KẾ HOẠCH TRIỂN KHAI MVP (HACKATHON 48H)

- **Data (Mock Data + Crawler):** Chuẩn bị dữ liệu cho **tối thiểu 8-10 Career Tracks** bao gồm cả 2 nhóm:
  - **Academic Tracks (4-5 track):** Data Science, Software Engineering, Marketing Digital, UI/UX Design, Business Analyst
  - **Vocational Tracks (3-4 track):** Kỹ thuật Điện - Tự động hóa, Kỹ thuật Ô tô, Công nghệ Thực phẩm/F&B (Đầu bếp - Quản lý nhà hàng), Y tế - Điều dưỡng Trung cấp
  - Mỗi track cần: Role Hierarchy, Skill Tree, mức lương thực tế, và các đơn vị tuyển dụng tiêu biểu.
- **Hour 1-12:** Dựng Database (PostgreSQL), Pinecone. Nạp Mock Data (JSON chuẩn) vào VectorDB cho cả Academic và Vocational tracks.
- **Hour 13-24:** Xây dựng **Agent 2A (Adaptive Counselor)**. Thiết kế **1 System Prompt nền trung lập** + logic **tự động chuyển sang 3 chế độ** (Cấp 3 / Nghề / ĐH) dựa trên suy luận ngầm từ Context Discovery. Giao diện đầu vào chỉ là **1 ô chat trống** — không có nút chọn loại học sinh.
- **Hour 25-36:** Dựng **Agent 3 (Roadmap Agent)** với Bias Guard Constraint bắt buộc — xuất ra JSON chuẩn chứa **đa lộ trình** (`paths[]` gồm ít nhất 1 vocational + 1 academic), kèm `match_score`, `why_it_fits`, và `disclaimer`.
- **Hour 37-48:** Thiết kế UI Frontend. Phần Roadmap hiển thị **tab/card cho từng lộ trình** (không chỉ 1). Sử dụng React Flow để vẽ Skill Tree cho từng path. Đóng băng code và chuẩn bị Pitching.

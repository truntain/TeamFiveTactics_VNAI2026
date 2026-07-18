# HƯỚNG DẪN TRIỂN KHAI TOÀN DIỆN HỆ THỐNG SKILLCOMPASS

Tài liệu này hướng dẫn chi tiết cách cài đặt, cấu hình và khởi chạy hoàn chỉnh hệ thống **SkillCompass** (bao gồm NestJS Backend, Agent 1 Market Data Pipeline, Agent 2 Counselor, và Agent 3 Roadmap Service).

---

## 1. YÊU CẦU HỆ THỐNG (PREREQUISITES)

Trước khi bắt đầu, hãy đảm bảo máy chủ/môi trường phát triển của bạn đã cài đặt:
- **Node.js**: Phiên bản 18 hoặc 20 trở lên.
- **Python**: Phiên bản 3.10 hoặc 3.11.
- **PostgreSQL**: Phiên bản 14 trở lên.
- **Pinecone Account**: Tài khoản Pinecone (miễn phí) để lưu trữ vector tìm kiếm.

---

## 2. THIẾT LẬP CƠ SỞ DỮ LIỆU

### 2.1. Cấu hình PostgreSQL
1. Đăng nhập vào PostgreSQL và tạo một database mới tên là `SKILLCOMPASS`:
   ```sql
   CREATE DATABASE "SKILLCOMPASS";
   ```
2. Đảm bảo bạn đã có thông tin tài khoản truy cập (User/Password) có toàn quyền trên database này.

### 2.2. Cấu hình Pinecone
1. Đăng nhập vào bảng điều khiển [Pinecone Console](https://app.pinecone.io/).
2. Tạo một Index mới với các thông số sau:
   - **Index Name**: `skillcompass-careers`
   - **Dimension**: `10` (Hệ thống sử dụng vector 10 chiều tương ứng 10 năng lực chuẩn UCEF).
   - **Metric**: `cosine` (Tính toán tương đồng góc Cosine).
3. Lấy **API Key** và tên Index để cấu hình trong các bước tiếp theo.

---

## 3. CẤU HÌNH BIẾN MÔI TRƯỜNG (.env)

Hệ thống gồm 4 folder chính cần cấu hình file `.env`. Hãy copy hoặc tạo file `.env` theo mẫu dưới đây:

### 3.1. Web Backend (NestJS)
Đường dẫn: `skillcompass/web/backend/.env`
```ini
PORT=3000
DATABASE_URL="postgresql://postgres:123456@localhost:5432/SKILLCOMPASS?schema=public"
```

### 3.2. Agent 1 (Market Pipeline)
Đường dẫn: `skillcompass/ai-services/market-pipeline/.env`
```ini
# --- LLM (FPT Cloud / DeepSeek) ---
LLM_API_KEY=your_fpt_or_deepseek_api_key
LLM_BASE_URL=https://mkp-api.fptcloud.com/v1
LLM_MODEL=DeepSeek-V4-Flash

# --- Pinecone ---
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=skillcompass-careers
PINECONE_DIMENSION=10

# --- PostgreSQL ---
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=SKILLCOMPASS
POSTGRES_USER=postgres
POSTGRES_PASSWORD=123456

# --- Pipeline Config ---
INPUT_FILE=../../../mock_data_agent1.json
BATCH_SIZE=50
```

### 3.3. Agent 2 (Counselor Microservice)
Đường dẫn: `skillcompass/ai-services/counselor/.env`
```ini
PORT=8002
LLM_API_KEY=your_fpt_or_deepseek_api_key
LLM_BASE_URL=https://mkp-api.fptcloud.com/v1
LLM_MODEL=DeepSeek-V4-Flash
```

### 3.4. Agent 3 (Roadmap Microservice)
Đường dẫn: `skillcompass/ai-services/roadmap/.env`
```ini
LLM_API_KEY=your_fpt_or_deepseek_api_key
LLM_BASE_URL=https://mkp-api.fptcloud.com/v1
LLM_MODEL=DeepSeek-V4-Flash

# --- Pinecone ---
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=skillcompass-careers

# --- PostgreSQL ---
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=SKILLCOMPASS
POSTGRES_USER=postgres
POSTGRES_PASSWORD=123456
```

---

## 4. CÀI ĐẶT & CHẠY PIPELINE NẠP DỮ LIỆU (AGENT 1)

Trước khi chạy hệ thống, chúng ta cần nạp dữ liệu ngành nghề và nhúng (embedding) vector của chúng lên Pinecone.

1. Di chuyển vào thư mục Market Pipeline:
   ```bash
   cd skillcompass/ai-services/market-pipeline
   ```
2. Khởi tạo môi trường ảo Python và cài đặt thư viện:
   ```bash
   python -m venv venv
   # Trên Windows:
   venv\Scripts\activate
   # Trên Linux/macOS:
   source venv/bin/activate

   pip install -r requirements.txt
   ```
3. Chạy script để khởi tạo schema bảng và nạp dữ liệu thô vào PostgreSQL:
   ```bash
   python load_mock_data.py
   ```
4. Chạy pipeline để gọi LLM bóc tách năng lực, tạo vector 10 chiều và tải (upsert) lên Pinecone:
   ```bash
   python agent1.py
   ```
   *(Sau khi chạy xong, 50 bản ghi ngành nghề sẽ có vector_id tương ứng trong PostgreSQL và đã được index thành công trên Pinecone).*

---

## 5. TRIỂN KHAI CÁC DỊCH VỤ (SERVICES DEPLOYMENT)

Mỗi dịch vụ cần được chạy độc lập trên các cổng mạng đã quy định.

### 5.1. Khởi chạy Agent 2 (Counselor - Cổng 8002)
1. Di chuyển vào thư mục Counselor:
   ```bash
   cd skillcompass/ai-services/counselor
   ```
2. Thiết lập môi trường và chạy server:
   ```bash
   python -m venv venv
   # Kích hoạt venv (Windows):
   venv\Scripts\activate
   
   pip install -r requirements.txt
   python main.py
   ```
   *Dịch vụ sẽ lắng nghe trên cổng: `http://localhost:8002`.*

### 5.2. Khởi chạy Agent 3 (Roadmap - Cổng 8003)
1. Di chuyển vào thư mục Roadmap:
   ```bash
   cd skillcompass/ai-services/roadmap
   ```
2. Thiết lập môi trường và chạy server:
   ```bash
   python -m venv venv
   # Kích hoạt venv (Windows):
   venv\Scripts\activate
   
   pip install -r requirements.txt
   python main.py
   ```
   *Dịch vụ sẽ lắng nghe trên cổng: `http://localhost:8003`.*

### 5.3. Khởi chạy Web Backend (NestJS - Cổng 3000)
1. Di chuyển vào thư mục NestJS:
   ```bash
   cd skillcompass/web/backend
   ```
2. Cài đặt các gói node_modules:
   ```bash
   npm install
   ```
3. Chạy Prisma CLI để đồng bộ schema cơ sở dữ liệu và tự động sinh Client:
   ```bash
   npx prisma db push
   npx prisma generate
   ```
4. Khởi chạy dự án ở chế độ phát triển:
   ```bash
   npm run start:dev
   ```
   *Dịch vụ chính sẽ lắng nghe trên cổng: `http://localhost:3000`.*

---

## 6. KIỂM TRA TOÀN LUỒNG (VERIFICATION)

Khi cả 3 service đã chạy (NestJS - 3000, Counselor - 8002, Roadmap - 8003):

1. Bạn có thể test trực tiếp bằng cách gọi API của NestJS Backend qua HTTP Client (Postman/Curl) để bắt đầu một phiên chat:
   - **Tạo/Gửi tin nhắn chat**: `POST http://localhost:3000/chat`
     ```json
     {
       "sessionId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
       "message": "Chào bạn, mình muốn được tư vấn hướng nghiệp học ngành công nghệ thông tin."
     }
     ```
   - Chat liên tục khoảng 5 - 10 lượt để hệ thống Evaluator của Agent 2 thu thập đủ dữ liệu. Khi nhận thấy cờ `is_ready: true` trả về trong phản hồi.
   
2. **Sinh lộ trình**: Gọi API sinh roadmap của NestJS:
   - **Sinh lộ trình nghề nghiệp**: `POST http://localhost:3000/roadmap/generate`
     ```json
     {
       "sessionId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
     }
     ```
     *Hệ thống NestJS sẽ lấy profile học sinh trong Postgres, đóng gói và gửi sang Agent 3 để thực hiện RAG (Pinecone + Postgres) và trả về báo cáo đa lộ trình JSON tuyệt đẹp.*

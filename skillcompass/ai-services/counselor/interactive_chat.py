import requests
import json

# API Endpoint of Agent 2
API_URL = "http://localhost:8002/chat"

# Setup a default framework (10 Core Competencies) for testing
TEST_FRAMEWORK = {
    "general_base_questions": [
        "Khi có thời gian rảnh rỗi, bạn thường ưu tiên làm những việc gì để thư giãn?",
        "Trong quá trình học trên lớp, bạn cảm thấy mình đặc biệt hứng thú với môn học nào nhất?",
        "Khi làm việc nhóm, bạn cảm thấy thoải mái nhất khi đảm nhận vai trò nào (như quản lý tiến độ, làm nội dung, hay thuyết trình)?"
    ],
    "field_specific_base_questions": [
        "Bạn thích những công việc thiên về vận động tay chân hay nghiêng về những công việc nhẹ nhàng, ít phải di chuyển hơn?",
        "Khi các vật dụng trong nhà bị hỏng hóc, bạn có thích tự lấy đồ nghề ra kiểm tra và cố gắng sửa chữa không?",
        "Nếu gặp một bài toán hoặc một vấn đề logic phức tạp, bạn sẽ muốn tự mình mày mò tìm quy luật hay muốn người khác chỉ cách làm luôn?"
    ],
    "traits_to_evaluate": {
        "adaptability_resilience": "Khả năng thích ứng và vượt khó.",
        "analytical_thinking": "Tư duy logic, phân tích dữ liệu và số liệu.",
        "continuous_learning": "Ham học hỏi và tự nâng cao trình độ.",
        "creativity_innovation": "Sáng tạo và đổi mới giải pháp.",
        "critical_thinking": "Tư duy phản biện và đánh giá đa chiều.",
        "effective_communication": "Giao tiếp thuyết phục và truyền đạt thông tin.",
        "problem_solving": "Giải quyết vấn đề và tìm phương án xử lý.",
        "responsibility_autonomy": "Làm việc độc lập và chịu trách nhiệm.",
        "team_collaboration": "Làm việc nhóm và hỗ trợ đồng nghiệp.",
        "work_ethics_integrity": "Đạo đức nghề nghiệp và tính trung thực."
    }
}

def interactive_chat():
    print("=" * 50)
    print("   SKILLCOMPASS INTERACTIVE CHAT CLIENT (AGENT 2)")
    print("=" * 50)
    print("Dùng để test tự động lưu lịch sử hội thoại và điểm số.")
    print("Gõ 'exit' hoặc 'quit' để thoát.\n")

    conversation_history = []
    current_state = None  # NestJS sẽ truyền state này, ở đây lưu trên RAM

    while True:
        # Lấy tin nhắn đầu vào từ người dùng
        user_input = input("Bạn: ").strip()
        if user_input.lower() in ("exit", "quit", "thoát", ""):
            print("Thoát chương trình.")
            break

        # Chuẩn bị payload theo API Contract mới
        payload = {
            "session_id": "interactive_test_session",
            "message": user_input,
            "target_field": "Vocational",
            "evaluation_framework": TEST_FRAMEWORK,
            "conversation_history": conversation_history,
            "current_state": current_state  # Truyền state hiện tại (stateless design)
        }

        try:
            response = requests.post(API_URL, json=payload, timeout=60)
            response.raise_for_status()
            data = response.json()

            # Lấy mảng replies và in từng dòng (mỗi dòng là 1 bong bóng chat)
            replies = data.get("replies", ["(Không có phản hồi)"])
            print("\nAI:")
            for line in replies:
                print(f"  {line}")
            print()

            # Cập nhật state mới nhất từ server (EMA đã tính xong)
            current_state = data.get("profile_update")

            # Cập nhật lịch sử hội thoại (gộp tất cả replies thành 1 lượt assistant)
            conversation_history.append({"role": "user", "content": user_input})
            conversation_history.append({"role": "assistant", "content": "\n".join(replies)})

            # Hiển thị hồ sơ đánh giá hiện tại
            if current_state:
                print("--- [Hồ sơ Đánh giá Hiện tại] ---")
                print(f"  + Sẵn sàng sinh lộ trình (is_ready): {current_state.get('is_ready', False)}")
                print(f"  + Điểm Core (core_scores): {json.dumps(current_state.get('core_scores', {}), ensure_ascii=False)}")
                print(f"  + Độ tin cậy (confidence_scores): {json.dumps(current_state.get('confidence_scores', {}), ensure_ascii=False)}")
                me = current_state.get("market_expectations", {})
                print(f"  + Địa điểm: {me.get('preferred_locations', [])}")
                print("-----------------------------------\n")

            # Nếu đã đủ thông tin, dừng
            if current_state and current_state.get("is_ready"):
                print("✅ Đã thu thập đủ thông tin! Hệ thống sẽ sinh lộ trình nghề nghiệp...")
                break

        except requests.exceptions.ConnectionError:
            print("❌ Không thể kết nối đến server. Hãy đảm bảo FastAPI đang chạy trên port 8002.\n")
        except requests.exceptions.Timeout:
            print("⏱️ Server mất quá nhiều thời gian để phản hồi. Thử lại sau.\n")
        except Exception as e:
            print(f"❌ Lỗi: {e}\n")

if __name__ == "__main__":
    interactive_chat()

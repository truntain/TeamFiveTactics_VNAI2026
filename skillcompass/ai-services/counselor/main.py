import uvicorn
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from config import PORT
from schemas.api_models import ChatRequest, ChatResponse, ProfileState, MarketExpectations
from logic import conversation, state_manager
from logic.logger_helper import save_json_log

# Initialize FastAPI app
app = FastAPI(
    title="SkillCompass - Counselor Microservice",
    description="Microservice cho Agent 2 (Counselor + Evaluator) - Port 8002",
    version="2.0.0"
)

# Configure CORS so NestJS and Next.js can connect easily
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "counselor-microservice"}

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    try:
        # Convert Pydantic models from history list to raw list of dicts
        history = [{"role": msg.role, "content": msg.content} for msg in request.conversation_history]
        
        # Convert evaluation framework and current state to raw dicts
        framework_dict = request.evaluation_framework.model_dump()
        
        # Initialize or parse current state
        if request.current_state:
            current_state_dict = request.current_state.model_dump()
        else:
            # First turn defaults
            current_state_dict = {
                "context_inferred": "highschool",
                "core_scores": {},
                "domain_scores": {},
                "market_expectations": {
                    "preferred_locations": [],
                    "expected_salary_min": 0,
                    "willing_to_relocate": False
                },
                "confidence_scores": {},
                "is_ready": False
            }

        # Check if first turn
        is_first_turn = len(history) == 0
        
        eval_result = {}
        counselor_instruction = "Tiếp tục trò chuyện sâu hơn về sở thích."

        if is_first_turn:
            # Lượt 1: Bỏ qua Evaluator để tối ưu tốc độ phản hồi (giảm 50% latency)
            # Khởi tạo điểm mặc định trong state
            traits = framework_dict.get("traits_to_evaluate", {})
            current_state_dict["core_scores"] = {k: 5.0 for k in traits.keys()}
            current_state_dict["confidence_scores"] = {k: 0.1 for k in traits.keys()}
            current_state_dict["is_ready"] = False
            
            # Xác định tiêu chí đầu tiên và lấy câu hỏi tình huống từ kho câu hỏi
            next_trait = state_manager.get_next_incomplete_trait(current_state_dict, traits)
            sq = state_manager.get_situational_question_for_trait(next_trait)
            counselor_instruction = (
                f"LƯU Ý HỆ THỐNG:\n"
                f"- Hãy gửi lời chào thân thiện, ngắn gọn và ấm áp để mở đầu cuộc trò chuyện hướng nghiệp.\n"
                f"- Tiêu chí cần đánh giá hiện tại là: '{next_trait}'.\n"
                f"- Câu hỏi mỏ neo bạn CÓ THỂ dùng để dẫn dắt: '{sq['anchor_question']}'.\n"
                f"- Hoặc dùng câu hỏi tình huống thực tế này (tự nhiên hơn): '{sq['situational_question']}'.\n"
                f"- Hãy chọn 1 trong 2 câu trên, diễn đạt lại tự nhiên và hỏi học sinh."
            )
        else:
            # Lượt 2 trở đi: Chạy Evaluator Agent ngầm tuần tự
            eval_result = await asyncio.to_thread(
                conversation.run_evaluator_llm,
                history,
                request.message,
                framework_dict,
                request.session_id
            )
            
            # Cập nhật State theo thuật toán EMA & Stopping Criteria
            current_state_dict = state_manager.update_profile_state(
                current_state_dict,
                eval_result,
                framework_dict.get("traits_to_evaluate", {}),
                history
            )
            
            turn_count = len(history) // 2
            # Nhận diện ngành học từ tin nhắn đầu tiên của user trong lịch sử
            first_user_msg = ""
            for msg in history:
                if msg.get("role") == "user":
                    first_user_msg = msg.get("content", "")
                    break
            
            field = "General"
            if "Công nghệ thông tin" in first_user_msg:
                field = "IT"
            elif "Kinh tế" in first_user_msg or "Kinh doanh" in first_user_msg:
                field = "Business"

            flows = {
                "General": {
                    1: {"trait": "continuous_learning", "question": "Khi học một kiến thức mới (ví dụ học tập, kỹ năng), bạn thường tiếp thu tốt nhất theo cách nào?"},
                    2: {"trait": "adaptability_resilience", "question": "Giả sử bạn chuẩn bị thuyết trình nhóm nhưng nói vấp và kết quả không như kỳ vọng. Bạn cảm thấy và phản ứng thế nào sau đó?"},
                    3: {"trait": "team_collaboration", "question": "Trong dự án nhóm ở lớp, bạn thường đảm nhận vai trò nào và cảm thấy thoải mái nhất với vị trí đó?"},
                    4: {"trait": "analytical_thinking", "question": "Nếu được lựa chọn tự do, bạn thích dành một ngày làm việc trong môi trường như thế nào nhất?"},
                    5: {"trait": "creativity_innovation", "question": "Bạn được giao nhiệm vụ: 'Hãy làm cho buổi họp lớp trở nên thú vị hơn — bạn có toàn quyền sáng tạo.' Bạn sẽ làm gì?"},
                    6: {"trait": "critical_thinking", "question": "Nhiều người thành công không nhất thiết phải đi theo con đường Đại học truyền thống. Bạn nghĩ thế nào và bạn đang hướng đến con đường nào?"},
                    7: {"trait": "responsibility_autonomy", "question": "Gia đình bạn có định hướng hay kỳ vọng gì về ngành nghề bạn sẽ chọn không? Bạn cảm thấy thế nào với điều đó?"},
                    8: {"trait": "work_ethics_integrity", "question": "Trong 5 năm tới, bạn hình dung bản thân đang làm gì? Hãy mô tả ngắn gọn nhất có thể."},
                    9: {"trait": "analytical_thinking", "question": "Câu hỏi cuối nhé! Trong danh sách các kỹ năng sau, bạn tự thấy mình nổi bật nhất ở điều gì?"}
                },
                "IT": {
                    1: {"trait": "continuous_learning", "question": "Khi học một kiến thức lập trình hay công nghệ mới, bạn tiếp thu tốt nhất bằng cách nào?"},
                    2: {"trait": "adaptability_resilience", "question": "Khi code bị lỗi (bug) phức tạp chạy mãi không được, bạn thường xử lý áp lực đó thế nào?"},
                    3: {"trait": "team_collaboration", "question": "Trong các dự án làm phần mềm nhóm, bạn thích làm Tech Lead thiết kế, Developer tập trung code hay Scrum Master gắn kết?"},
                    4: {"trait": "analytical_thinking", "question": "Trong ngành CNTT, bạn thích ngồi viết code thuật toán, thiết kế giải pháp hệ thống hay nghiên cứu AI/ML mới?"},
                    5: {"trait": "creativity_innovation", "question": "Nếu được giao làm một sản phẩm sáng tạo cho lớp, bạn sẽ viết một app/web mini kết nối, tích hợp chatbot AI hay tổ chức hackathon?"},
                    6: {"trait": "critical_thinking", "question": "Lập trình viên có nhất thiết phải học Đại học chính quy hay tự học/học bootcamp là đủ? Bạn hướng đi thế nào?"},
                    7: {"trait": "responsibility_autonomy", "question": "Gia đình có ủng hộ đam mê theo đuổi ngành Công nghệ thông tin của bạn không? Bạn tự quyết định hay theo ý kiến bố mẹ?"},
                    8: {"trait": "work_ethics_integrity", "question": "Mục tiêu 5 năm tới của bạn là trở thành Senior Dev/Tech Lead, làm chủ startup công nghệ hay chuyên gia AI/Data?"},
                    9: {"trait": "analytical_thinking", "question": "Câu hỏi lập trình cuối nhé! Bạn tự đánh giá mình mạnh nhất ở tư duy giải thuật, khả năng tự học công nghệ mới hay thiết kế hệ thống?"}
                },
                "Business": {
                    1: {"trait": "continuous_learning", "question": "Khi học về quản trị hay kinh tế, bạn thích phân tích case study doanh nghiệp, chơi game giả lập hay thuyết trình nhóm?"},
                    2: {"trait": "adaptability_resilience", "question": "Nếu kế hoạch kinh doanh nhóm của bạn gặp thất bại không đạt mục tiêu/KPI, bạn sẽ xử lý thế nào?"},
                    3: {"trait": "team_collaboration", "question": "Trong nhóm làm dự án kinh tế, bạn muốn làm trưởng nhóm lên chiến lược, chuyên viên phân tích số liệu hay người thương lượng đối tác?"},
                    4: {"trait": "analytical_thinking", "question": "Bạn thấy mình hứng thú làm về quản lý tài chính/ngân sách, gặp gỡ đàm phán với khách hàng hay lên quy trình vận hành?"},
                    5: {"trait": "creativity_innovation", "question": "Để thu hút học sinh tham gia câu lạc bộ khởi nghiệp, bạn sẽ tổ chức game giả lập, mời doanh nhân chia sẻ hay làm chiến dịch marketing độc đáo?"},
                    6: {"trait": "critical_thinking", "question": "Lập trình viên có nhất thiết phải học Đại học chính quy ngành Quản lý hay tự kinh doanh để tích lũy thực chiến? Bạn hướng đi thế nào?"},
                    7: {"trait": "responsibility_autonomy", "question": "Gia đình có định hướng bạn tiếp quản kinh doanh hay kỳ vọng gì về ngành nghề của bạn không? Bạn cảm thấy thế nào?"},
                    8: {"trait": "work_ethics_integrity", "question": "Trong 5 năm tới, bạn muốn làm quản lý kinh doanh, sở hữu chuỗi kinh doanh riêng hay chuyên gia phân tích tài chính?"},
                    9: {"trait": "analytical_thinking", "question": "Câu hỏi cuối nhé! Kỹ năng kinh doanh nổi bật nhất của bạn là giao tiếp đàm phán, nhạy bén số liệu thị trường hay lập kế hoạch tổ chức?"}
                }
            }

            demo_flow = flows[field]

            if current_state_dict.get("is_ready") or turn_count >= 10:
                current_state_dict["is_ready"] = True
                counselor_instruction = "LƯU Ý HỆ THỐNG: Đã thu thập đủ 10 lượt thông tin. KHÔNG hỏi thêm câu nào nữa. Hãy đưa ra lời cảm ơn chân thành, nhận xét tích cực về thế mạnh của học sinh và thông báo rằng hệ thống đang phân tích lộ trình phát triển tối ưu."
            elif turn_count in demo_flow:
                next_trait = demo_flow[turn_count]["trait"]
                target_question = demo_flow[turn_count]["question"]
                counselor_instruction = (
                    f"LƯU Ý HỆ THỐNG:\n"
                    f"- Tiêu chí cần đánh giá hiện tại là: '{next_trait}'.\n"
                    f"- Hãy đưa ra câu hỏi mốc mỏ neo sau đây: '{target_question}'.\n"
                    f"- Hãy viết một câu cầu nối thấu cảm ngắn gọn với câu trả lời vừa rồi của học sinh, "
                    f"sau đó dẫn dắt tự nhiên để đặt đúng câu hỏi mỏ neo ở trên."
                )
            elif eval_result.get("is_off_topic"):
                # Soft-Bridging: Xử lý khi người dùng nói lạc đề (chit-chat/troll)
                counselor_instruction = "LƯU Ý HỆ THỐNG: Người dùng đang nói lạc đề. Hãy hùa theo họ 1 câu ngắn gọn vui vẻ, sau đó DÙNG TỪ NỐI (VD: À mà, Nhắc mới nhớ, Sẵn tiện) để bẻ lái mượt mà quay lại câu hỏi đánh giá đang bị dang dở."
            elif eval_result.get("warning_signal"):
                # Phát hiện tín hiệu chọn sai nghề (theo trend, áp lực gia đình, v.v.)
                counselor_instruction = (
                    "LƯU Ý HỆ THỐNG: Học sinh có thể đang thể hiện dấu hiệu chọn ngành không xuất phát từ bản thân "
                    "(ví dụ: theo xu hướng, theo gia đình, hoặc chưa thực sự tìm hiểu). "
                    "Hãy nhẹ nhàng và tế nhị đặt một câu hỏi giúp học sinh tự kiểm tra lại: "
                    "liệu sự lựa chọn này có thực sự đến từ đam mê và năng lực của bản thân không, "
                    "hay có yếu tố bên ngoài nào đang ảnh hưởng?"
                )
            else:
                # Xác định tiêu chí chưa hoàn thành tiếp theo và kết hợp câu hỏi tình huống
                traits = framework_dict.get("traits_to_evaluate", {})
                next_trait = state_manager.get_next_incomplete_trait(current_state_dict, traits)
                if next_trait:
                    market_snippet = state_manager.get_market_insight_for_trait(next_trait)
                    sq = state_manager.get_situational_question_for_trait(next_trait)
                    counselor_instruction = (
                        f"LƯU Ý HỆ THỐNG:\n"
                        f"- Tiêu chí cần đánh giá hiện tại là: '{next_trait}'.\n"
                        f"- Ngữ cảnh thị trường: Ngành '{market_snippet['career_track']}' ({market_snippet['field']}) "
                        f"có nhu cầu: '{market_snippet['market_insight']}'.\n"
                        f"- Câu hỏi tình huống gợi ý để khảo sát tiêu chí này: '{sq['situational_question']}'.\n"
                        f"- Dấu hiệu điểm cao cần chú ý: {sq['high_score_signals']}.\n"
                        f"- Hãy viết một câu cầu nối thấu cảm với câu trả lời vừa rồi của học sinh, "
                        f"sau đó dẫn dắt tự nhiên vào câu hỏi tình huống ở trên (có thể diễn đạt lại linh hoạt)."
                    )
                else:
                    counselor_instruction = "Tiếp tục trò chuyện tự nhiên và đào sâu hơn về sở thích."


        # Chạy Counselor Agent (Agent 2A)
        replies_list = await asyncio.to_thread(
            conversation.run_counselor_llm,
            history,
            request.message,
            request.target_field,
            framework_dict,
            counselor_instruction,
            request.session_id
        )
        
        # Build ProfileState object to return
        raw_me = current_state_dict.get("market_expectations", {})
        market_expectations_obj = MarketExpectations(
            preferred_locations=raw_me.get("preferred_locations", []),
            expected_salary_min=raw_me.get("expected_salary_min", 0),
            willing_to_relocate=raw_me.get("willing_to_relocate", False),
            family_support=raw_me.get("family_support"),
            health_issues=raw_me.get("health_issues"),
            asked_family=raw_me.get("asked_family", False),
            asked_health=raw_me.get("asked_health", False)
        )
        
        profile_state_obj = ProfileState(
            context_inferred=current_state_dict.get("context_inferred", "highschool"),
            core_scores=current_state_dict.get("core_scores", {}),
            domain_scores=current_state_dict.get("domain_scores", {}),
            market_expectations=market_expectations_obj,
            confidence_scores=current_state_dict.get("confidence_scores", {}),
            is_ready=current_state_dict.get("is_ready", False)
        )
        
        chat_response_obj = ChatResponse(
            replies=replies_list,
            profile_update=profile_state_obj,
            is_ready=profile_state_obj.is_ready
        )
        
        # Save request/response exchange log
        save_json_log("api", request.session_id, {
            "request": request.model_dump(),
            "response": chat_response_obj.model_dump()
        })
        
        return chat_response_obj
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error occurred in /chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

if __name__ == "__main__":
    # Start uvicorn server
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)

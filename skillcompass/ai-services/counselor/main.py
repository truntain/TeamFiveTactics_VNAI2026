import uvicorn
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from config import PORT
from schemas.api_models import ChatRequest, ChatResponse, ProfileState, MarketExpectations
from logic import conversation, state_manager

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
            
            counselor_instruction = "Hãy gửi lời chào thân thiện mở đầu cuộc trò chuyện hướng nghiệp và hỏi câu mỏ neo Chung đầu tiên."
        else:
            # Lượt 2 trở đi: Chạy Evaluator Agent ngầm tuần tự
            eval_result = await asyncio.to_thread(
                conversation.run_evaluator_llm,
                history,
                request.message,
                framework_dict
            )
            
            # Cập nhật State theo thuật toán EMA & Stopping Criteria
            current_state_dict = state_manager.update_profile_state(
                current_state_dict,
                eval_result,
                framework_dict.get("traits_to_evaluate", {}),
                history
            )
            
            # Routing Logic & Graceful Closing
            turn_count = len(history) // 2
            
            if current_state_dict.get("is_ready"):
                # Khi đã đủ điểm, CẤM Counselor hỏi thêm. Yêu cầu nói lời chào kết thúc.
                counselor_instruction = "LƯU Ý HỆ THỐNG: Đã thu thập đủ thông tin. KHÔNG hỏi thêm câu nào nữa. Hãy đưa ra lời cảm ơn, nhận xét tích cực và thông báo rằng hệ thống đang tiến hành phân tích để trả về lộ trình nghề nghiệp."
            elif eval_result.get("is_off_topic"):
                # Soft-Bridging: Xử lý khi người dùng nói lạc đề (chit-chat/troll)
                counselor_instruction = "LƯU Ý HỆ THỐNG: Người dùng đang nói lạc đề. Hãy hùa theo họ 1 câu ngắn gọn vui vẻ, sau đó DÙNG TỪ NỐI (VD: À mà, Nhắc mới nhớ, Sẵn tiện) để bẻ lái mượt mà quay lại câu hỏi đánh giá đang bị dang dở."
            elif current_state_dict.get("market_expectations", {}).get("expected_salary_min", 0) == 0 and turn_count > 3:
                # Ép Counselor phải hỏi về lương/thị trường nếu sau 3 lượt chưa có
                counselor_instruction = "LƯU Ý HỆ THỐNG: Ngay lập tức hỏi khéo về mức lương kỳ vọng và khu vực làm việc mong muốn của bạn học sinh."
            else:
                counselor_instruction = "Tiếp tục trò chuyện sâu hơn về sở thích."

        # Chạy Counselor Agent (Agent 2A)
        replies_list = await asyncio.to_thread(
            conversation.run_counselor_llm,
            history,
            request.message,
            request.target_field,
            framework_dict,
            counselor_instruction
        )
        
        # Build ProfileState object to return
        raw_me = current_state_dict.get("market_expectations", {})
        market_expectations_obj = MarketExpectations(
            preferred_locations=raw_me.get("preferred_locations", []),
            expected_salary_min=raw_me.get("expected_salary_min", 0),
            willing_to_relocate=raw_me.get("willing_to_relocate", False)
        )
        
        profile_state_obj = ProfileState(
            context_inferred=current_state_dict.get("context_inferred", "highschool"),
            core_scores=current_state_dict.get("core_scores", {}),
            domain_scores=current_state_dict.get("domain_scores", {}),
            market_expectations=market_expectations_obj,
            confidence_scores=current_state_dict.get("confidence_scores", {}),
            is_ready=current_state_dict.get("is_ready", False)
        )
        
        return ChatResponse(
            replies=replies_list,
            profile_update=profile_state_obj,
            is_ready=profile_state_obj.is_ready
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error occurred in /chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

if __name__ == "__main__":
    # Start uvicorn server
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)

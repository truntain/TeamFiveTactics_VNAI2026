from typing import Dict, Any, List

def update_profile_state(
    current_state: Dict[str, Any], 
    evaluator_output: Dict[str, Any],
    traits_to_evaluate: Dict[str, str],
    conversation_history: List[Any]
) -> Dict[str, Any]:
    """
    Cập nhật ProfileState của học sinh bằng thuật toán Exponential Moving Average (EMA)
    và cộng dồn độ tin cậy (confidence score) theo đặc tả của Agent 2.
    """
    # Đảm bảo các cấu trúc dữ liệu cốt lõi đã tồn tại
    if "core_scores" not in current_state:
        current_state["core_scores"] = {}
    if "confidence_scores" not in current_state:
        current_state["confidence_scores"] = {}
    if "domain_scores" not in current_state:
        current_state["domain_scores"] = {}
    if "market_expectations" not in current_state:
        current_state["market_expectations"] = {
            "preferred_locations": [],
            "expected_salary_min": 0,
            "willing_to_relocate": False
        }

    # 1. Khởi tạo điểm cho các traits có trong framework nếu chưa có
    for trait in traits_to_evaluate.keys():
        if trait not in current_state["core_scores"]:
            # Mặc định là 5.0 đối với các traits trong framework chưa có điểm
            current_state["core_scores"][trait] = 5.0
        if trait not in current_state["confidence_scores"]:
            current_state["confidence_scores"][trait] = 0.1

    # 2. Cập nhật core_scores và confidence_scores từ kết quả Evaluator
    eval_core = evaluator_output.get("core_scores", {})
    for trait, new_score in eval_core.items():
        # Chỉ cập nhật nếu trait nằm trong framework cần đánh giá
        if trait in traits_to_evaluate:
            old_score = current_state["core_scores"].get(trait, 5.0)
            # Cập nhật điểm theo trung bình trọng số (EMA)
            current_state["core_scores"][trait] = float(old_score * 0.7 + new_score * 0.3)
            # Tăng độ tin cậy thêm 0.25 mỗi lần có nhắc đến, tối đa là 1.0
            old_conf = current_state["confidence_scores"].get(trait, 0.1)
            current_state["confidence_scores"][trait] = min(1.0, old_conf + 0.25)
        else:
            # Trait mới ngoài framework thì gán trực tiếp
            current_state["core_scores"][trait] = float(new_score)
            current_state["confidence_scores"][trait] = 0.4

    # 3. Cập nhật domain_scores
    eval_domain = evaluator_output.get("domain_scores", {})
    for trait, new_score in eval_domain.items():
        if trait in current_state["domain_scores"]:
            old_domain_score = current_state["domain_scores"][trait]
            current_state["domain_scores"][trait] = float(old_domain_score * 0.7 + new_score * 0.3)
        else:
            current_state["domain_scores"][trait] = float(new_score)

    # 4. Cập nhật market_expectations
    eval_me = evaluator_output.get("market_expectations", {})
    if eval_me:
        # Cập nhật địa điểm (tránh trùng lặp)
        pref_loc = eval_me.get("preferred_locations", [])
        current_locs = current_state["market_expectations"].get("preferred_locations", [])
        for loc in pref_loc:
            if loc not in current_locs:
                current_locs.append(loc)
        current_state["market_expectations"]["preferred_locations"] = current_locs

        # Cập nhật mức lương kỳ vọng nếu có con số cụ thể lớn hơn 0
        expected_salary = eval_me.get("expected_salary_min", 0)
        if expected_salary > 0:
            current_state["market_expectations"]["expected_salary_min"] = expected_salary

        # Cập nhật willing_to_relocate
        if "willing_to_relocate" in eval_me:
            current_state["market_expectations"]["willing_to_relocate"] = bool(eval_me["willing_to_relocate"])

    # 5. Tính độ tin cậy trung bình của toàn bộ 10 Core Competencies (hoặc các core traits đang có)
    # Đặc tả yêu cầu chia cho 10 cố định
    avg_confidence = sum(current_state["confidence_scores"].values()) / 10

    # 6. Kiểm tra điều kiện Dừng (Stopping Criteria)
    # Lượt chat của user được tính bằng: chiều dài lịch sử chia đôi
    turn_count = len(conversation_history) // 2
    
    # Cập nhật is_ready dựa trên điều kiện
    if avg_confidence > 0.75 or turn_count >= 10:
        current_state["is_ready"] = True
    else:
        current_state["is_ready"] = False

    return current_state

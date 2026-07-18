"""
logic/pii_filter.py - Lớp lọc thông tin cá nhân (PII) trước khi gửi lên LLM bên thứ 3.

Mục đích:
    Thay thế thông tin nhạy cảm bằng placeholder trung tính để bảo vệ quyền riêng tư
    của học sinh khi dữ liệu hội thoại được gửi lên FPT Cloud / DeepSeek API.

Nguyên tắc:
    - Ẩn: Số điện thoại, email, địa chỉ số nhà cụ thể, tên trường học cụ thể.
    - GIỮ NGUYÊN: Tỉnh/thành phố lớn (Hà Nội, TP.HCM...) vì cần thiết cho career matching.
    - GIỮ NGUYÊN: Họ tên tiếng Việt KHÔNG được xử lý (quá phức tạp + ít rủi ro trong bối cảnh hướng nghiệp).
    - GIỮ NGUYÊN: Sở thích, mô tả hành vi, tính cách (đây là dữ liệu cần phân tích).
"""
import re

# ── Regex patterns để nhận dạng PII ──────────────────────────────────────────

# Số điện thoại Việt Nam: 0xxxxxxxxx hoặc +84xxxxxxxxx
PHONE_PATTERN = re.compile(r"\b(?:0|\+84)\d{9,10}\b")

# Email
EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")

# Địa chỉ cụ thể: phải có số nhà + từ khóa đường/phố/hẻm/ngõ, kết thúc ở dấu phẩy/chấm/hết câu
ADDRESS_PATTERN = re.compile(
    r"\b\d{1,5}\s*(?:đường|phố|hẻm|ngõ|ngách|lô|số nhà)\s+[^\.,;!\?\n]{3,50}",
    re.IGNORECASE | re.UNICODE
)

# Tên trường học cụ thể: keyword + tên riêng (kết thúc ở dấu câu, "ở", "tại", "và", hết câu)
# Dùng lookahead để không ăn quá nhiều text
SCHOOL_PATTERN = re.compile(
    r"(?:trường thpt|trường đại học|đại học|học viện|trường cao đẳng|cao đẳng|thpt)\s+"
    r"[A-ZĐÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝĂƠƯ][^\.,;!\?\n]{2,35}",
    re.IGNORECASE | re.UNICODE
)


def anonymize_message(text: str) -> str:
    """
    Ẩn PII trong một đoạn văn bản.

    Thứ tự xử lý:
        1. Số điện thoại → [LIÊN_HỆ]
        2. Email → [LIÊN_HỆ]
        3. Địa chỉ cụ thể → [ĐỊA_CHỈ]
        4. Tên trường học → [TRƯỜNG_HỌC]

    Args:
        text: Nội dung tin nhắn thô từ học sinh.

    Returns:
        Văn bản đã được lọc PII, an toàn để gửi lên LLM.
    """
    if not text or not isinstance(text, str):
        return text

    result = text

    # 1. Ẩn số điện thoại
    result = PHONE_PATTERN.sub("[LIÊN_HỆ]", result)

    # 2. Ẩn email
    result = EMAIL_PATTERN.sub("[LIÊN_HỆ]", result)

    # 3. Ẩn địa chỉ cụ thể (phải có số nhà)
    result = ADDRESS_PATTERN.sub("[ĐỊA_CHỈ]", result)

    # 4. Ẩn tên trường học cụ thể
    result = SCHOOL_PATTERN.sub("[TRƯỜNG_HỌC]", result)

    return result


def anonymize_history(conversation_history: list[dict]) -> list[dict]:
    """
    Lọc PII toàn bộ lịch sử hội thoại trước khi gửi lên LLM.

    Chỉ lọc messages từ phía user (role == "user").
    Messages của assistant giữ nguyên (do chính LLM sinh ra, không có PII người dùng).

    Args:
        conversation_history: List các dict {role, content}.

    Returns:
        Bản sao của lịch sử đã được ẩn PII, object gốc không bị thay đổi.
    """
    anonymized = []
    for turn in conversation_history:
        if turn.get("role") == "user":
            anonymized.append({
                "role": "user",
                "content": anonymize_message(turn.get("content", ""))
            })
        else:
            anonymized.append(turn)
    return anonymized

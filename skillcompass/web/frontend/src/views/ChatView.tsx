import React, { useState, useEffect, useRef } from 'react';
import { View } from '../types';
import { Send, Loader2, ArrowLeft } from 'lucide-react';
import logoImg from '../app/logo.png';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://teamfivetactics-vnai2026-1.onrender.com';

const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Lấy session hiện tại (không tạo mới)
const getCurrentSessionId = () => {
  if (typeof window === 'undefined') return '00000000-0000-0000-0000-000000000000';
  return sessionStorage.getItem('skillcompass_session_id') || localStorage.getItem('skillcompass_session_id') || '';
};

// Tạo phiên làm việc MỚI — ghi đè session cũ
const startNewSession = (): string => {
  if (typeof window === 'undefined') return '00000000-0000-0000-0000-000000000000';
  const sid = generateUUID();
  localStorage.setItem('skillcompass_session_id', sid);
  sessionStorage.setItem('skillcompass_session_id', sid);
  return sid;
};

// ─────────────────────────────────────────────
// QUICK REPLY CHIPS — context-aware per turn
// ─────────────────────────────────────────────
type ChipSet = { label: string; value: string }[];

const QUICK_REPLIES: ChipSet[] = [
  // Turn 0 — câu mở đầu: ngành quan tâm
  [
    { label: 'Công nghệ thông tin', value: 'Mình đang quan tâm đến ngành Công nghệ thông tin' },
    { label: 'Y Dược / Sức khỏe',   value: 'Mình đang quan tâm đến ngành Y Dược và chăm sóc sức khỏe' },
    { label: 'Kinh tế / Kinh doanh', value: 'Mình đang quan tâm đến ngành Kinh tế hoặc Kinh doanh' },
    { label: 'Thiết kế / Nghệ thuật', value: 'Mình đang quan tâm đến lĩnh vực Thiết kế và Nghệ thuật' },
    { label: 'Marketing / Truyền thông', value: 'Mình đang quan tâm đến ngành Marketing hoặc Truyền thông' },
    { label: 'Chưa biết, cần tư vấn', value: 'Mình chưa biết nên học ngành gì, cần được tư vấn' },
  ],
  // Turn 1 — phong cách học tập
  [
    { label: 'Đọc sách & ghi chép', value: 'Mình thích đọc sách, ghi chú cẩn thận rồi tự làm bài tập từ lý thuyết' },
    { label: 'Xem video & thực hành', value: 'Mình cần xem video và tự tay làm thử mới hiểu được' },
    { label: 'Thảo luận & dạy lại', value: 'Mình học tốt nhất khi được giải thích cho người khác hoặc thảo luận nhóm' },
  ],
  // Turn 2 — xử lý áp lực / thất bại
  [
    { label: 'Phân tích lại, cải thiện ngay', value: 'Mình buồn một lúc nhưng sau đó tự hỏi mình sai ở đâu và cố gắng cải thiện cho lần sau' },
    { label: 'Mất khá lâu mới lấy lại tinh thần', value: 'Mình khó chịu và cứ nghĩ mãi về chỗ vấp, mất khá lâu để lấy lại tinh thần' },
    { label: 'Không để bụng, tiếp tục thôi', value: 'Mình thấy không sao, ai cũng có lúc thế, mình không quá để bụng' },
  ],
  // Turn 3 — vai trò trong nhóm
  [
    { label: 'Lên kế hoạch, phân công việc', value: 'Mình hay tự nhiên đứng ra phân công việc, nhắc deadline và tổng hợp bài cuối' },
    { label: 'Làm thật tốt phần được giao', value: 'Mình thích được giao một phần cụ thể rồi tự làm thật tốt phần đó' },
    { label: 'Kết nối & hòa giải trong nhóm', value: 'Mình hay đóng vai kết nối, đảm bảo mọi người hiểu nhau và không bị căng thẳng' },
  ],
  // Turn 4 — môi trường làm việc lý tưởng
  [
    { label: 'Phân tích dữ liệu / lập trình', value: 'Mình thích ngồi trước máy tính, code hoặc phân tích số liệu, giải quyết bài toán kỹ thuật' },
    { label: 'Gặp gỡ & thuyết phục người khác', value: 'Mình thích gặp gỡ, trò chuyện với nhiều người, tư vấn hoặc thuyết phục họ' },
    { label: 'Thiết kế / sáng tạo nội dung', value: 'Mình muốn được tạo ra thứ gì đó — vẽ, viết, thiết kế hoặc làm video' },
    { label: 'Chăm sóc & hỗ trợ cộng đồng', value: 'Mình thích đi ra ngoài, chăm sóc người khác hoặc làm việc có ý nghĩa xã hội' },
  ],
  // Turn 5 — tư duy sáng tạo
  [
    { label: 'Đề xuất format / quy trình mới', value: 'Mình sẽ đề xuất một format mới, ví dụ mỗi người chia sẻ điều học được theo kiểu TED Talk ngắn' },
    { label: 'Thêm game / bình chọn tương tác', value: 'Mình nghĩ sẽ thêm mini-game hoặc bình chọn trực tuyến để mọi người tương tác hơn' },
    { label: 'Cần định hướng trước, chưa tự nghĩ được', value: 'Thật ra mình chưa biết bắt đầu từ đâu, cần xem người khác đề xuất gì đã' },
  ],
  // Turn 6 — đại học hay nghề
  [
    { label: 'Học Đại học chính quy', value: 'Mình vẫn muốn học Đại học chính quy vì bằng cấp quan trọng với ngành mình chọn' },
    { label: 'Học nghề / Cao đẳng thực hành', value: 'Mình đang cân nhắc học nghề hoặc Cao đẳng để ra trường sớm và có việc làm nhanh hơn' },
    { label: 'Tùy ngành, xem xét cả hai', value: 'Mình chưa chắc, nếu có con đường nào ngắn hơn mà hiệu quả mình cũng xem xét' },
  ],
  // Turn 7 — ảnh hưởng gia đình
  [
    { label: 'Mình tự quyết, đã có định hướng', value: 'Gia đình có ý kiến nhưng mình đã xác định được ngành mình muốn và tự tin thuyết phục họ' },
    { label: 'Theo ý gia đình, dù không phải ưu tiên số 1', value: 'Gia đình muốn mình học ngành đó, mình không phản đối dù không phải ưu tiên số 1 của mình' },
    { label: 'Chưa nói chuyện với gia đình, chưa rõ', value: 'Mình chưa nói chuyện với gia đình về điều này và cũng chưa rõ bản thân muốn gì' },
  ],
  // Turn 8 — tầm nhìn 5 năm
  [
    { label: 'Làm tại công ty công nghệ', value: 'Mình đang hình dung 5 năm tới mình làm tại công ty công nghệ, phụ trách phát triển phần mềm hoặc dữ liệu' },
    { label: 'Tự kinh doanh / có startup riêng', value: 'Mình muốn tự kinh doanh hoặc có startup nhỏ của riêng mình' },
    { label: 'Công việc ổn định, thu nhập tốt', value: 'Mình chưa biết rõ, chỉ muốn có công việc ổn định và thu nhập tốt' },
    { label: 'Tạo ra tác động xã hội', value: 'Mình muốn làm gì đó có ý nghĩa, giúp đỡ cộng đồng hoặc tạo ra tác động xã hội' },
  ],
  // Turn 9 — kỹ năng nổi bật tự nhận
  [
    { label: 'Phân tích logic & Tổ chức kế hoạch', value: 'Mình thấy mình nổi bật nhất ở kỹ năng phân tích tư duy logic và khả năng tổ chức lên kế hoạch' },
    { label: 'Giao tiếp & Sáng tạo ý tưởng', value: 'Mình nổi bật nhất ở kỹ năng giao tiếp thuyết phục và tư duy sáng tạo ý tưởng mới' },
    { label: 'Sáng tạo & Thực hành tay nghề', value: 'Mình mạnh nhất ở sáng tạo và các kỹ năng thực hành tay nghề cụ thể' },
    { label: 'Đồng cảm & Lắng nghe', value: 'Mình được nhiều người nhận xét là có khả năng đồng cảm và lắng nghe tốt' },
  ],
];

const INITIAL_MSG = [{ role: 'ai' as const, text: 'Xin chào! Mình là SkillCompass 🎯\n\nMình ở đây để giúp bạn tìm ra ngành học và nghề nghiệp thực sự phù hợp với con người của bạn — không phải theo xu hướng, không phải vì áp lực xung quanh.\n\n👉 Bạn đang quan tâm đến ngành nghề hoặc lĩnh vực nào không?\n   Nếu có rồi — hãy kể cho mình nghe, mình sẽ tư vấn ngay!\n   Nếu chưa biết — cũng không sao, mình có bài đánh giá ngắn giúp bạn khám phá điểm mạnh và tìm ra hướng đi phù hợp nhất.', isFinal: false }];

function ChatView({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [msgs, setMsgs] = useState<Array<{ role: 'ai' | 'user'; text: string; isFinal?: boolean }>>(INITIAL_MSG);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [usedChips, setUsedChips] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [msgs, isLoading]);

  useEffect(() => {
    // Mỗi lần ChatView mount → bắt đầu phiên làm việc MỚI
    startNewSession();
    setMsgs(INITIAL_MSG);
    setInput('');
    setUsedChips(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const sessionId = getCurrentSessionId();
    const userMsg = text.trim();
    const next = [...msgs, { role: 'user' as const, text: userMsg, isFinal: false }];
    setMsgs(next);
    setInput('');
    setUsedChips(false);
    setIsLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: userMsg }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsgs(p => [
          ...p,
          {
            role: 'ai',
            text: (data && data.message) ? (typeof data.message === 'string' ? data.message : JSON.stringify(data.message)) : 'Rất tiếc, đã có lỗi kết nối tới hệ thống tư vấn AI.',
            isFinal: false
          }
        ]);
        return;
      }
      setMsgs(p => [
        ...p,
        {
          role: 'ai',
          text: data.reply || 'Cảm ơn bạn đã chia sẻ!',
          isFinal: !!data.is_ready
        }
      ]);
    } catch (err) {
      console.error('Error calling Chat API:', err);
      setMsgs(p => [
        ...p,
        {
          role: 'ai',
          text: 'Rất tiếc, đã có lỗi kết nối tới hệ thống tư vấn AI. Vui lòng thử lại.',
          isFinal: false
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMessage(input);
  };

  const handleChipClick = async (value: string) => {
    setUsedChips(true);
    await sendMessage(value);
  };

  // Xác định bộ chip phù hợp với lượt hội thoại hiện tại
  const userTurns = msgs.filter(m => m.role === 'user').length;
  const totalTurns = 10;
  const pct = Math.min(Math.round((userTurns / totalTurns) * 100), 100);
  const currentChips: ChipSet = (!isLoading && !usedChips && userTurns < QUICK_REPLIES.length)
    ? QUICK_REPLIES[userTurns]
    : [];
  const isSessionDone = msgs.some(m => m.isFinal);

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: '"Google Sans Flex", sans-serif', background: 'transparent' }}>

      {/* SIDEBAR */}
      <div className="chat-sidebar" style={{ width: '300px', background: '#FFFFFF', borderRight: '1px solid rgba(6,4,14,0.06)', padding: '32px 24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Nút thoát */}
        <div style={{ marginBottom: '24px' }}>
          <button
            onClick={() => onNavigate('home')}
            style={{
              background: 'transparent', border: 'none', color: '#5F6368',
              fontSize: '14px', fontWeight: 500, display: 'flex', alignItems: 'center',
              gap: '8px', cursor: 'pointer', padding: '0', transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.color = '#D93025';
              const arrow = e.currentTarget.querySelector('.back-arrow') as HTMLElement;
              if (arrow) arrow.style.transform = 'translateX(-4px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.color = '#5F6368';
              const arrow = e.currentTarget.querySelector('.back-arrow') as HTMLElement;
              if (arrow) arrow.style.transform = 'none';
            }}
          >
            <ArrowLeft className="back-arrow" size={18} style={{ transition: 'transform 0.2s ease' }} />
            Thoát phiên trò chuyện
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
          <img src={logoImg.src} alt="Logo" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
          <div>
            <h3 style={{ fontWeight: 500, fontSize: '20px', lineHeight: '24px', color: '#06040E', margin: 0 }}>AI Counselor</h3>
            <p style={{ fontWeight: 700, fontSize: '12px', lineHeight: '16px', color: 'rgba(6,4,14,0.5)', margin: 0, textTransform: 'uppercase', letterSpacing: '1.2px' }}>ACTIVE SESSION</p>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: '#5F6368' }}>Tiến trình thu thập</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#0260FF' }}>{pct}%</span>
          </div>
          <div style={{ height: '6px', borderRadius: '3px', background: '#F0F4FF', overflow: 'hidden' }}>
            <div style={{ height: '6px', borderRadius: '3px', background: 'linear-gradient(90deg, #0260FF, #40A2FF)', width: `${pct}%`, transition: 'width 0.5s ease' }} />
          </div>
          <p style={{ fontSize: '12px', color: 'rgba(6,4,14,0.4)', marginTop: '6px', margin: '6px 0 0 0' }}>
            {userTurns}/{totalTurns} lượt trả lời
          </p>
        </div>

        {/* Lịch sử hội thoại */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(6,4,14,0.35)', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px 0' }}>
            Lịch sử trò chuyện
          </p>
          {msgs.filter(m => m.role === 'user').length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ fontSize: '13px', color: 'rgba(6,4,14,0.35)', lineHeight: '20px' }}>
                Chưa có tin nhắn nào.<br />Hãy bắt đầu trò chuyện!
              </p>
            </div>
          ) : (
            msgs.map((m, i) => {
              if (m.role !== 'user') return null;
              const turnNo = msgs.slice(0, i + 1).filter(x => x.role === 'user').length;
              const preview = m.text.length > 60 ? m.text.slice(0, 60) + '...' : m.text;
              return (
                <div key={i} style={{ padding: '10px 14px', borderRadius: '12px', background: '#F8F9FC', border: '1px solid rgba(6,4,14,0.06)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#0260FF', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                    Lượt {turnNo}
                  </div>
                  <div style={{ fontSize: '13px', color: '#06040E', lineHeight: '18px' }}>{preview}</div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* CHAT AREA */}
      <div className="chat-area-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '40px' }}>
        <div className="gemini-card chat-card" style={{ flex: 1, borderRadius: '20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Header */}
          <div className="chat-header" style={{ padding: '24px 32px', borderBottom: '1px solid rgba(6,4,14,0.06)', display: 'flex', alignItems: 'center', gap: '12px', background: '#FFFFFF' }}>
            <button className="mobile-exit-btn" onClick={() => onNavigate('home')} style={{
              background: 'none', border: 'none', cursor: 'pointer', display: 'none', color: '#5F6368', padding: '4px'
            }}>
              <ArrowLeft size={24} />
            </button>
            <h2 className="chat-title" style={{ fontWeight: 500, fontSize: '32px', lineHeight: '36px', color: '#06040E', margin: 0 }}>Tư vấn Định hướng Hướng nghiệp</h2>
          </div>

          {/* Messages */}
          <div className="chat-messages" style={{ flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', background: '#FAFAFA' }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '72%', padding: '16px 24px',
                  borderRadius: m.role === 'user' ? '24px 24px 4px 24px' : '24px 24px 24px 4px',
                  background: m.role === 'user' ? '#0260FF' : '#FFFFFF',
                  color: m.role === 'user' ? '#FFFFFF' : '#06040E',
                  fontWeight: 400, fontSize: '16px', lineHeight: '24px',
                  boxShadow: m.role === 'ai' ? '0 4px 16px rgba(0,0,0,0.04)' : '0 4px 16px rgba(0,0,0,0.08)',
                  border: m.role === 'ai' ? '1px solid rgba(0,0,0,0.06)' : 'none',
                  whiteSpace: 'pre-wrap'
                }}>
                  <div style={{ marginBottom: m.isFinal ? '16px' : '0' }}>{m.text}</div>
                  {m.isFinal && (
                    <button className="gemini-gradient-btn" onClick={() => onNavigate('results')} style={{
                      height: '40px', padding: '0 20px', borderRadius: '20px', cursor: 'pointer',
                      fontWeight: 500, fontSize: '16px', lineHeight: '20px', display: 'inline-block'
                    }}>Xem Lộ trình chi tiết</button>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ background: '#FFFFFF', padding: '16px 24px', borderRadius: '24px', border: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '8px', color: '#5F6368' }}>
                  <Loader2 className="animate-spin" size={18} />
                  <span>AI Counselor đang suy nghĩ...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="chat-input-area" style={{ padding: '20px 32px', borderTop: '1px solid rgba(0,0,0,0.04)', background: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* ─── QUICK REPLY CHIPS ─── */}
            {currentChips.length > 0 && !isSessionDone && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'rgba(6,4,14,0.4)', fontWeight: 500, letterSpacing: '0.4px' }}>
                  💡 Gợi ý nhanh — click để chọn:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {currentChips.map((chip, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleChipClick(chip.value)}
                      disabled={isLoading}
                      style={{
                        padding: '10px 18px',
                        borderRadius: '24px',
                        border: '1.5px solid #0260FF',
                        background: '#F0F6FF',
                        color: '#0260FF',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        transition: 'all 0.18s ease',
                        lineHeight: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        opacity: isLoading ? 0.5 : 1,
                        boxShadow: '0 2px 8px rgba(2,96,255,0.08)',
                      }}
                      onMouseOver={(e) => {
                        if (!isLoading) {
                          e.currentTarget.style.background = '#0260FF';
                          e.currentTarget.style.color = '#FFFFFF';
                          e.currentTarget.style.boxShadow = '0 4px 16px rgba(2,96,255,0.25)';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = '#F0F6FF';
                        e.currentTarget.style.color = '#0260FF';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(2,96,255,0.08)';
                        e.currentTarget.style.transform = 'none';
                      }}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '16px', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '40px', padding: '8px 8px 8px 24px', boxShadow: '0 8px 24px rgba(0,0,0,0.04)' }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                disabled={isLoading || isSessionDone}
                placeholder={isSessionDone ? 'Phiên tư vấn đã hoàn tất ✅' : 'Nhập câu trả lời hoặc click gợi ý bên trên...'}
                style={{
                  flex: 1, border: 'none', outline: 'none', background: 'transparent',
                  fontWeight: 400, fontSize: '16px', lineHeight: '20px', color: '#06040E',
                }}
              />
              <button
                type="submit"
                disabled={isLoading || isSessionDone || !input.trim()}
                className="gemini-gradient-btn"
                style={{
                  width: '48px', height: '48px', borderRadius: '24px',
                  cursor: (isLoading || isSessionDone || !input.trim()) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: (isLoading || isSessionDone || !input.trim()) ? 0.5 : 1
                }}
              >
                <Send size={20} strokeWidth={2} />
              </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}

export default ChatView;

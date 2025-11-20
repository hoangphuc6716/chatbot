// ======================= PHẦN KHAI BÁO =========================
const chatbotToggler = document.querySelector(".chatbot-toggler");
const closeBtn = document.querySelector(".close-btn");
const chatbox = document.querySelector(".chatbox");
const chatInput = document.querySelector(".chat-input textarea");
const sendChatBtn = document.querySelector("#send-btn");
const downloadBtn = document.querySelector("#download-btn"); // Nút tải mới
const deleteBtn = document.querySelector("#delete-btn");     // Nút xóa mới

// 🚨 THAY API KEY CỦA BẠN VÀO ĐÂY
const API_KEY = "AIzaSyChPW3UlaCNSJEhjWu_loERTWI72qFY0SY"; 
const MODEL_NAME = "gemini-2.5-flash"; 

let userMessage = null;
const inputInitHeight = chatInput.scrollHeight;
const today = new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

const SYSTEM_INSTRUCTION = {
  parts: [{
    text: `Bạn là "Checky" - Trợ lý AI Sự Thật. Hôm nay là: ${today}.
    🔥 NHIỆM VỤ: Dùng Google Search kiểm chứng thông tin, ưu tiên nguồn chính thống (.gov.vn, báo lớn).
    ⚠️ QUY TẮC: Trả lời ngắn gọn, khách quan, bác bỏ tin đồn sai lệch một cách khoa học, thân thiện, hiệu quả.`
  }]
};

// Khởi tạo lịch sử chat (Lấy từ bộ nhớ nếu có)
let conversationHistory = JSON.parse(localStorage.getItem("checky_history")) || [
  {
    role: "model",
    parts: [{ text: `Chào bạn!. Checky đã sẵn sàng kiểm chứng thông tin giúp bạn! 🕵️‍♂️` }]
  }
];

// ======================= HÀM TIỆN ÍCH (LƯU & TẢI) =========================

// 1. Lưu lịch sử vào LocalStorage (Để F5 không mất)
const saveHistoryToLocal = () => {
    localStorage.setItem("checky_history", JSON.stringify(conversationHistory));
    localStorage.setItem("checky_html", chatbox.innerHTML);
}

// 2. Tải lại lịch sử khi mở web
const loadHistoryFromLocal = () => {
    const savedHtml = localStorage.getItem("checky_html");
    if (savedHtml) {
        chatbox.innerHTML = savedHtml;
        chatbox.scrollTo(0, chatbox.scrollHeight);
    }
}

// 3. Xóa lịch sử
const clearHistory = () => {
    if(confirm("Bạn có chắc muốn xóa toàn bộ đoạn chat không?")) {
        localStorage.removeItem("checky_history");
        localStorage.removeItem("checky_html");
        location.reload(); // Tải lại trang để reset
    }
}

// 4. Tải đoạn chat về máy (.txt)
const downloadConversation = () => {
    let content = `=== HỒ SƠ KIỂM CHỨNG CHECKY (${today}) ===\n\n`;
    
    conversationHistory.forEach(msg => {
        const role = msg.role === "user" ? "👤 BẠN: " : "🤖 CHECKY: ";
        // Loại bỏ các thẻ HTML khi lưu vào file text
        let text = msg.parts[0].text.replace(/<[^>]*>?/gm, ''); 
        content += `${role}${text}\n\n-------------------\n\n`;
    });

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Checky_Evidence_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

// ======================= HÀM UI & API =========================
const createChatLi = (message, className) => {
  const chatLi = document.createElement("li");
  chatLi.classList.add("chat", className);
  let chatContent = className === "outgoing" ? `<p></p>` : `<span class="material-symbols-outlined">verified_user</span><p></p>`;
  chatLi.innerHTML = chatContent;
  chatLi.querySelector("p").textContent = message;
  return chatLi;
};

const generateResponse = async (chatElement) => {
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;
  const requestBody = {
    system_instruction: SYSTEM_INSTRUCTION, 
    contents: conversationHistory,
    generationConfig: { temperature: 0.4, maxOutputTokens: 1000 },
    tools: [{ google_search: {} }] 
  };

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const data = await response.json();

    if (!response.ok) throw new Error(data.error?.message || "Lỗi kết nối API");

    const candidate = data.candidates?.[0];
    const textPart = candidate?.content?.parts?.[0]?.text;
    
    if (!textPart) throw new Error("Không tìm thấy nội dung.");

    let botResponse = textPart.trim();
    botResponse = botResponse.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>').replace(/^[\*•-]\s/gm, '• ');

    // Xử lý nguồn (Grounding)
    let sourceHtml = "";
    const uniqueUrls = new Map();
    const groundingMetadata = candidate.groundingMetadata;

    if (groundingMetadata) {
        groundingMetadata.groundingChunks?.forEach(chunk => {
            if (chunk.web?.uri && chunk.web?.title) uniqueUrls.set(chunk.web.uri, chunk.web.title);
        });
        if (uniqueUrls.size === 0) {
            groundingMetadata.groundingAttributions?.forEach(attr => {
                if (attr.web?.uri) uniqueUrls.set(attr.web.uri, attr.web.title || new URL(attr.web.uri).hostname);
            });
        }
    }

    if (uniqueUrls.size > 0) {
        sourceHtml = `<div class="sources-container"><div class="source-header">🔎 Nguồn xác thực:</div><div class="source-list">`;
        uniqueUrls.forEach((title, url) => {
            let cleanTitle = title.length > 40 ? title.substring(0, 40) + "..." : title;
            sourceHtml += `<a href="${url}" target="_blank" class="source-chip" title="${title}">🔗 ${cleanTitle}</a>`;
        });
        sourceHtml += `</div></div>`;
    }

    chatElement.querySelector("p").innerHTML = botResponse + sourceHtml;
    
    // Lưu vào lịch sử & LocalStorage
    conversationHistory.push({ role: "model", parts: [{ text: textPart }] });
    saveHistoryToLocal(); // <--- LƯU TỰ ĐỘNG

  } catch (error) {
    chatElement.querySelector("p").classList.add("error");
    chatElement.querySelector("p").innerHTML = `⚠️ Lỗi: ${error.message}`;
  } finally {
    chatbox.scrollTo(0, chatbox.scrollHeight);
  }
};

// ======================= EVENT LISTENERS =========================
const handleChat = () => {
  userMessage = chatInput.value.trim();
  if (!userMessage) return;
  chatInput.value = "";
  chatInput.style.height = `${inputInitHeight}px`;

  chatbox.appendChild(createChatLi(userMessage, "outgoing"));
  chatbox.scrollTo(0, chatbox.scrollHeight);

  conversationHistory.push({ role: "user", parts: [{ text: userMessage }] });
  saveHistoryToLocal(); // <--- LƯU TỰ ĐỘNG KHI GỬI TIN

  setTimeout(() => {
    const incomingChatLi = createChatLi("Checky đang tìm kiếm... 🔍", "incoming");
    chatbox.appendChild(incomingChatLi);
    chatbox.scrollTo(0, chatbox.scrollHeight);
    generateResponse(incomingChatLi);
  }, 600);
};

// Các sự kiện khác
chatInput.addEventListener("input", () => {
  chatInput.style.height = `${inputInitHeight}px`;
  chatInput.style.height = `${chatInput.scrollHeight}px`;
});
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && window.innerWidth > 800) {
    e.preventDefault();
    handleChat();
  }
});

sendChatBtn.addEventListener("click", handleChat);
chatbotToggler.addEventListener("click", () => document.body.classList.toggle("show-chatbot"));
closeBtn.addEventListener("click", () => document.body.classList.remove("show-chatbot"));

// Sự kiện cho các nút mới
downloadBtn.addEventListener("click", downloadConversation);
deleteBtn.addEventListener("click", clearHistory);

// Tải lại lịch sử cũ khi mở trang
loadHistoryFromLocal();
/**
 * SYNTHETIC SOURCE FIXTURES (kept separate from operational storage).
 *
 * Six short texts written for this demo: two English, two Vietnamese, two mixed Vietnamese-English.
 * None comes from a real person or a real dataset. They exist in the app bundle so the participant's
 * BROWSER can encrypt them; the operational store (data/store) only ever receives ciphertext.
 * One fixture quotes HTML/script markup on purpose: it must render as inert text.
 */
export interface Fixture {
  id: string;
  label: string;
  language: "en" | "vi" | "mixed";
  text: string;
}

export const FIXTURES: Fixture[] = [
  {
    id: "fx-en-1",
    label: "Parcel fee text (English)",
    language: "en",
    text:
      "I got a text saying my parcel was held at customs and I had to pay a small fee through a link. " +
      "The link looked almost like the courier's real website, but one letter was different. " +
      "The message even contained this raw markup: <img src=x onerror=alert('xss')>",
  },
  {
    id: "fx-en-2",
    label: "Fake IT support request (English)",
    language: "en",
    text:
      "Our team chat had a message from \"IT support\" asking everyone to re-enter their password before Friday. " +
      "Nobody on the team had heard of that IT person, and the account was created yesterday.",
  },
  {
    id: "fx-vi-1",
    label: "Tin nhắn khóa tài khoản ngân hàng (Tiếng Việt)",
    language: "vi",
    text:
      "Tôi nhận được tin nhắn báo tài khoản ngân hàng bị khóa và phải bấm vào đường link để xác minh. " +
      "Tin nhắn có nhiều lỗi chính tả và giọng văn rất gấp gáp, nên tôi không bấm vào.",
  },
  {
    id: "fx-vi-2",
    label: "Cuộc gọi giả danh điện lực (Tiếng Việt)",
    language: "vi",
    text:
      "Có người gọi điện tự xưng là nhân viên điện lực, nói rằng nhà tôi sẽ bị cắt điện trong hai giờ nếu không chuyển khoản ngay. " +
      "Tôi đã gác máy và gọi lại tổng đài chính thức để kiểm tra.",
  },
  {
    id: "fx-mixed-1",
    label: "Urgent invoice email (mixed)",
    language: "mixed",
    text:
      "Hôm qua mình nhận một email \"urgent invoice\" từ một supplier lạ, có file đính kèm .zip. " +
      "Mình không mở mà forward cho team IT để check trước.",
  },
  {
    id: "fx-mixed-2",
    label: "OTP request from a hacked friend (mixed)",
    language: "mixed",
    text:
      "Bạn mình bị hack Facebook rồi account đó nhắn cho mình xin mã OTP. " +
      "Mình thấy suspicious vì bạn ấy chưa bao giờ nhắn kiểu \"help me pls, gấp lắm\".",
  },
];

/** The one study in scope. Its exact text is hashed into every grant's key-wrap binding. */
export const STUDY = {
  id: "STUDY-CS-2026-01",
  title: "How people describe suspicious messages (synthetic demo study)",
  purpose:
    "Study CS-2026-01 (synthetic demo): qualitative reading of how people describe suspicious messages " +
    "in English, Vietnamese and mixed Vietnamese-English. Read-only access for the named researcher only. " +
    "No model training, no export, no attempt to re-identify the contributor.",
} as const;

export const WITHDRAWAL_LIMITATION =
  "Withdrawing blocks new access through this portal. It cannot erase anything the researcher already " +
  "read, copied or screenshotted while access was active.";

export const PURPOSE_LIMITATION =
  "The study purpose is recorded and bound to the grant, but it cannot technically stop misuse after an " +
  "authorised researcher has read the text.";

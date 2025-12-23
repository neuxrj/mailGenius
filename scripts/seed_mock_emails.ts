/**
 * 脚本：批量注入模拟邮件数据到 gmail.sqlite
 * 运行方式：npx tsx scripts/seed_mock_emails.ts
 */

import Database from 'better-sqlite3';

const GMAIL_DB_PATH = 'gmail.sqlite';
const ACCOUNT_EMAIL = 'xrjall@gmail.com';

// 生成唯一 ID
const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

// 获取最近几天的时间戳（美西时间）
const getRecentTimestamp = (daysAgo: number, hoursAgo: number = 0) => {
  const now = new Date();
  now.setDate(now.getDate() - daysAgo);
  now.setHours(now.getHours() - hoursAgo);
  return now.getTime();
};

// 模拟邮件数据 - 覆盖不同场景
const mockEmails = [
  // ========== 高优先级场景 ==========
  {
    from_email: 'ceo@techcorp.com',
    to_email: ACCOUNT_EMAIL,
    subject: 'URGENT: Q4 Budget Approval Needed by EOD',
    snippet: 'Hi, I need your immediate approval on the Q4 budget proposal. Please review and sign off before 5 PM today. This is critical for our planning.',
    body_text: 'Hi,\n\nI need your immediate approval on the Q4 budget proposal attached. Please review and sign off before 5 PM today.\n\nThis is critical for our planning cycle.\n\nBest,\nJohn Smith\nCEO, TechCorp',
    internal_date: getRecentTimestamp(0, 2),
    is_read: 0,
  },
  {
    from_email: 'hr@amazon.com',
    to_email: ACCOUNT_EMAIL,
    subject: 'Interview Invitation - Software Engineer Position',
    snippet: 'Congratulations! We would like to invite you for an on-site interview for the Software Engineer position. Please confirm your availability.',
    body_text: 'Dear Candidate,\n\nCongratulations! After reviewing your application, we would like to invite you for an on-site interview for the Software Engineer position at Amazon.\n\nPlease confirm your availability for next week.\n\nBest regards,\nAmazon Recruiting Team',
    internal_date: getRecentTimestamp(0, 5),
    is_read: 0,
  },
  {
    from_email: 'security@google.com',
    to_email: ACCOUNT_EMAIL,
    subject: '紧急：检测到异常登录活动',
    snippet: '我们检测到您的账户在新设备上登录。如果这不是您本人操作，请立即更改密码并启用两步验证。',
    body_text: '尊敬的用户，\n\n我们检测到您的 Google 账户在一个新设备上登录（位置：越南）。\n\n如果这不是您本人操作，请立即：\n1. 更改密码\n2. 启用两步验证\n3. 检查账户活动\n\nGoogle 安全团队',
    internal_date: getRecentTimestamp(0, 1),
    is_read: 0,
  },
  {
    from_email: 'client@bigclient.io',
    to_email: ACCOUNT_EMAIL,
    subject: 'Re: Contract Renewal - Action Required',
    snippet: 'We need to finalize the contract renewal by Friday. Please send over the revised terms ASAP.',
    body_text: 'Hi,\n\nFollowing up on our call yesterday. We need to finalize the contract renewal by this Friday.\n\nPlease send over the revised terms ASAP so our legal team can review.\n\nThanks,\nSarah Johnson\nVP of Operations, BigClient Inc.',
    internal_date: getRecentTimestamp(1, 3),
    is_read: 0,
  },

  // ========== 低优先级场景 ==========
  {
    from_email: 'newsletter@medium.com',
    to_email: ACCOUNT_EMAIL,
    subject: 'Your Daily Digest: Top Stories in Tech',
    snippet: 'Today\'s top stories: AI breakthroughs, startup funding news, and the future of remote work. Read now!',
    body_text: 'Your Daily Digest\n\nTop Stories:\n1. OpenAI announces GPT-5\n2. Startup raises $100M Series B\n3. Remote work trends in 2025\n\nClick to read more...\n\nUnsubscribe',
    internal_date: getRecentTimestamp(0, 8),
    is_read: 0,
  },
  {
    from_email: 'promo@shopify.com',
    to_email: ACCOUNT_EMAIL,
    subject: '🎉 Holiday Sale: 50% OFF Everything!',
    snippet: 'Don\'t miss our biggest sale of the year! Use code HOLIDAY50 for 50% off all plans. Limited time only.',
    body_text: '🎉 HOLIDAY SALE 🎉\n\n50% OFF all Shopify plans!\n\nUse code: HOLIDAY50\n\nOffer expires: December 31, 2025\n\nShop now and save big!\n\nUnsubscribe from marketing emails',
    internal_date: getRecentTimestamp(0, 12),
    is_read: 0,
  },
  {
    from_email: 'notifications@linkedin.com',
    to_email: ACCOUNT_EMAIL,
    subject: 'You have 5 new connection requests',
    snippet: 'John Doe, Jane Smith, and 3 others want to connect with you on LinkedIn.',
    body_text: 'You have new connection requests:\n\n- John Doe, Software Engineer at Google\n- Jane Smith, Product Manager at Meta\n- 3 others\n\nAccept or ignore these requests on LinkedIn.',
    internal_date: getRecentTimestamp(1, 6),
    is_read: 0,
  },
  {
    from_email: 'noreply@uber.com',
    to_email: ACCOUNT_EMAIL,
    subject: 'Your Uber receipt from December 21',
    snippet: 'Thanks for riding with Uber! Your trip cost $23.45. View your receipt for more details.',
    body_text: 'Thanks for riding with Uber!\n\nTrip Details:\nDate: December 21, 2025\nFrom: 123 Main St\nTo: 456 Oak Ave\nTotal: $23.45\n\nView receipt online',
    internal_date: getRecentTimestamp(1, 10),
    is_read: 0,
  },

  // ========== 商业咨询场景 ==========
  {
    from_email: 'inquiry@startup.co',
    to_email: ACCOUNT_EMAIL,
    subject: 'Partnership Inquiry - Potential Collaboration',
    snippet: 'Hi, I came across your company and would love to explore potential partnership opportunities. Would you be available for a quick call?',
    body_text: 'Hi,\n\nI\'m the founder of Startup.co. I came across your company and was impressed by your work in the AI space.\n\nI\'d love to explore potential partnership opportunities. Would you be available for a 30-minute call next week?\n\nLooking forward to hearing from you.\n\nBest,\nMike Chen\nFounder, Startup.co',
    internal_date: getRecentTimestamp(0, 4),
    is_read: 0,
  },
  {
    from_email: 'sales@salesforce.com',
    to_email: ACCOUNT_EMAIL,
    subject: 'Follow up: Salesforce Enterprise Demo',
    snippet: 'Just following up on our previous conversation about Salesforce Enterprise. Ready to schedule a personalized demo?',
    body_text: 'Hi,\n\nI wanted to follow up on our previous conversation about Salesforce Enterprise solutions.\n\nAre you ready to schedule a personalized demo? I can show you how our platform can help streamline your sales process.\n\nLet me know your availability.\n\nBest,\nEmily Wang\nAccount Executive, Salesforce',
    internal_date: getRecentTimestamp(2, 5),
    is_read: 0,
  },
];

function seedMockEmails() {
  const db = new Database(GMAIL_DB_PATH);

  // 先清除已有数据
  console.log('🗑️  清除已有邮件数据...');
  db.exec(`DELETE FROM gmail_messages`);
  console.log('✅ 已清除所有邮件数据\n');

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO gmail_messages (
      account_email, message_id, thread_id, internal_date, date,
      from_email, to_email, subject, snippet, is_read,
      body_text, body_html, raw, priority
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  console.log('🚀 开始注入模拟邮件数据...\n');

  const insertMany = db.transaction(() => {
    for (const email of mockEmails) {
      const messageId = generateId();
      const threadId = generateId();
      const date = new Date(email.internal_date).toUTCString();

      insertStmt.run(
        ACCOUNT_EMAIL,
        messageId,
        threadId,
        email.internal_date,
        date,
        email.from_email,
        email.to_email,
        email.subject,
        email.snippet,
        email.is_read,
        email.body_text,
        null, // body_html
        null, // raw
        0     // priority = 0 (未分析)
      );

      console.log(`✅ 插入: ${email.subject.substring(0, 50)}...`);
      console.log(`   发件人: ${email.from_email}`);
      console.log(`   时间: ${date}\n`);
    }
  });

  insertMany();

  // 统计结果
  const count = db.prepare(`SELECT COUNT(*) as count FROM gmail_messages WHERE account_email = ? AND priority = 0`).get(ACCOUNT_EMAIL) as { count: number };

  console.log('━'.repeat(50));
  console.log(`🎉 完成！共注入 ${mockEmails.length} 封模拟邮件`);
  console.log(`📊 当前未分析邮件总数 (priority=0): ${count.count}`);
  console.log('━'.repeat(50));

  db.close();
}

seedMockEmails();


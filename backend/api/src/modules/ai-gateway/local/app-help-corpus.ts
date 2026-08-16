/**
 * Built-in "how does TopiaDesk work" Q&A — personalized, conversational
 * answers that make the chat feel like talking to a knowledgeable colleague
 * rather than reading a manual. These responses use the user's name when
 * available and lean into natural, human communication patterns.
 *
 * Each entry's `question` is canonical; `keywords` are alternative phrasings
 * that should trigger the same answer. All get embedded for similarity search,
 * so phrasing variations (e.g., "how does", "what's the process for") help
 * the matcher find the right answer even when users don't phrase things the
 * expected way. `answer` is returned verbatim and should sound conversational,
 * not like documentation.
 */
export interface AppHelpEntry {
  question: string;
  keywords?: string[];
  answer: string;
}

export const APP_HELP_CORPUS: AppHelpEntry[] = [
  {
    question: 'how do I create a new lead',
    keywords: ['how do I add a lead', 'adding a new lead', 'where do I start with a new prospect'],
    answer: 'Head to Leads and click "New Lead". Just fill in their contact info and where they came from (the source). Once you save it, you can nurture it and convert it to an Opportunity when it\'s looking like a real deal.',
  },
  {
    question: 'how do I convert a lead to an opportunity',
    keywords: ['turning a lead into an opportunity', "what's the difference between a lead and an opportunity"],
    answer: 'Great question! A Lead is just an inquiry — not qualified yet. When you\'re confident they\'re a real prospect, open the lead and hit "Convert". The system will create an Opportunity (and an Account if you don\'t have one yet) and carry all the info forward so nothing gets lost.',
  },
  {
    question: 'how do I add a new policy',
    keywords: ['setting up a policy', 'creating a new policy', 'how to write a new policy'],
    answer: 'Easy — find the client\'s Account and go to the Policies tab, then click "New Policy". You\'ll pick the type of business (line of business), which carrier, how much coverage (sum insured), and when payments are due. The system walks you through it.',
  },
  {
    question: 'what is KYC and how does it work',
    keywords: ['KYC requirements', 'why is KYC important', 'how do I stay compliant with KYC'],
    answer: 'KYC stands for "Know Your Customer" — it\'s compliance verification that each person on a policy is actually who they say they are. The system tracks KYC status and expiry dates automatically. If someone\'s verification has expired, the system won\'t let you renew their policy until they get verified again. No manual tracking needed — it just works.',
  },
  {
    question: 'how do commissions work for producers',
    keywords: ['producer commission calculation', 'how do I track producer commissions', 'setting up producer payments'],
    answer: 'Producers are listed in your directory, and commissions are calculated automatically for each policy they write or renew. You don\'t have to manually cut checks or do month-end reconciliation — the system handles it. Just set up the producers and TopiaDesk does the rest.',
  },
  {
    question: 'how do renewals work',
    keywords: ['policy renewals', 'what happens when a policy renews', 'when is renewal coming up'],
    answer: 'When you set up a policy with a renewal date, TopiaDesk tracks it. You\'ll see a renewal schedule on the policy showing whether it\'s on track, at risk, or already in progress. The system even flags renewals that are coming due so you don\'t miss them.',
  },
  {
    question: 'how do I file or track a claim',
    keywords: ['creating a claim', 'tracking a claim', 'claim status', 'what\'s the difference between a claim and a ticket'],
    answer: 'Claims and support tickets are different things. For claims, go to the Claims section and create a new one linked to the policy. You\'ll record the date of loss, reason, and any reserve amount. The system tracks it all the way through to settlement. It\'s separate from regular support tickets.',
  },
  {
    question: 'how do I create a report',
    keywords: ['custom reports', 'building a report', 'reporting on data', 'how do I analyze sales data'],
    answer: 'Go to Reports and choose "Custom Report". Pick what you want to analyze (accounts, opportunities, policies, etc.), select which fields to show, pick a chart type if you want one, and you\'re done. You can even schedule reports to email you automatically every week or month.',
  },
  {
    question: 'how do I see my dashboard and KPIs',
    keywords: ['checking my metrics', 'where\'s my dashboard', 'how do I see my numbers'],
    answer: 'Your Dashboard is your personal command center. It shows your pipeline value, win rate, upcoming renewals, open opportunities, and health scores for your accounts. You can customize it to show exactly what matters to you — click "Customize dashboard" to add or remove widgets.',
  },
  {
    question: 'how do I log an activity or note on an account',
    keywords: ['logging a call', 'recording a meeting', 'adding notes to an account', 'activity timeline'],
    answer: 'Open the Account, go to the Activity tab, and click "Log Activity". Record whether it was a call, meeting, or just a note. Everything you log shows up in the account\'s timeline so you (and your team) can see the full history of interactions.',
  },
  {
    question: 'how do I manage support cases or tickets',
    keywords: ['creating tickets', 'ticket workflow', 'how to track customer issues', 'opening a case'],
    answer: 'Cases are support tickets. Go to Cases, create a new one, give it a subject and priority, and assign it. You can filter by status or priority to stay on top of what\'s open. SLA rules automatically track response times so nothing slips through the cracks.',
  },
  {
    question: 'how do I add a new account or client',
    keywords: ['creating an account', 'onboarding a new client', 'adding a new customer', 'where do I start with a new account'],
    answer: 'Go to Accounts and click "New Account". Choose the type (individual, corporate, or household group), fill in the basics, and save. Everything else — policies, contacts, opportunities, activities — connects to this account, so it\'s the foundation for everything.',
  },
  {
    question: 'what is the difference between a lead and an opportunity',
    keywords: ['lead vs opportunity', 'when does a lead become an opportunity'],
    answer: 'A Lead is an unqualified prospect — someone who inquired or was referred but you haven\'t qualified yet. An Opportunity is the real deal — a verified prospect with a deal value, close date, and a real chance to win. Once you\'ve qualified a lead, you convert it to an Opportunity.',
  },
  {
    question: 'how do I check pipeline value or open deals',
    keywords: ['what\'s my total pipeline', 'how many open opportunities do I have', 'pipeline value'],
    answer: 'Your Dashboard shows all your open opportunities and their total value instantly. Or ask me directly — I can pull up your exact pipeline number, deal count, or even drill down by stage if you\'re curious.',
  },
  {
    question: 'how do I assign a case to someone',
    keywords: ['routing tickets', 'case assignment', 'who should handle this ticket', 'auto-routing cases'],
    answer: 'Just open the case and use the Assignee field to pick who should handle it. Or, if your team has set up assignment rules, they route cases automatically based on skill tags or round-robin. You can preview who a rule would pick before turning it on.',
  },
  {
    question: 'how do household or corporate group accounts work',
    keywords: ['group accounts', 'parent and child accounts', 'household accounts', 'organization structures'],
    answer: 'A parent account can have child accounts under it — think of a parent company with branches, or a household with family members. All the policies and premiums under the whole tree roll up to the parent for a unified view. It\'s perfect for organizations or family-run businesses.',
  },
  {
    question: 'how do I search the knowledge base',
    keywords: ['finding help articles', 'searching for documentation', 'knowledge base search'],
    answer: 'Go to the Knowledge Base (or Help) and search by topic. Or just ask me any "how do I..." question and I\'ll search for you. If there\'s a published article on it, I\'ll show you. If not, I\'ve got built-in answers for the most common questions.',
  },
  {
    question: 'how do I handle a data subject access request',
    keywords: ['GDPR request', 'customer data export', 'deleting customer data', 'privacy request'],
    answer: 'Go to Data Requests and log a new request for that contact. You can choose to Export their data (they get a file) or Erase it (anonymize them completely). It\'s deliberate and irreversible once you confirm, so take a second to make sure it\'s the right call.',
  },
  {
    question: 'what are loss cause categories',
    keywords: ['claim categories', 'why did the claim happen', 'claim reason codes'],
    answer: 'Loss Cause Categories are the reasons claims occur — things like "theft", "water damage", "vehicle collision", etc. You can tag claims with these when you create them, which helps with reporting and analysis later.',
  },
  {
    question: 'how do I build an audience segment for a campaign',
    keywords: ['campaign targeting', 'audience filters', 'who should I email'],
    answer: 'Go to Audience Segments and build a filter-based list of who you want to reach. You can filter by account type, location, renewal status, policy type, pretty much anything. Once you\'ve got your list, use it for email campaigns.',
  },
  {
    question: "how do I see who's unsubscribed from campaigns",
    keywords: ['email suppressions', 'bounced emails', 'opt-outs', 'campaign suppressions'],
    answer: 'The Suppressions list shows everyone who\'s opted out, bounced, or complained. It\'s read-only on purpose — the system only adds people here, it doesn\'t let you quietly remove them. It\'s a safety feature to protect your reputation.',
  },
  {
    question: 'how do policy approval thresholds work',
    keywords: ['approval rules', 'policy change approvals', 'when do I need approval for a policy change'],
    answer: 'You can set up rules that say "policy changes over $X need approval from Y people". So a big endorsement might need sign-off, but a small rider doesn\'t. It gives you control while keeping things moving.',
  },
  {
    question: 'how do I use a macro on a ticket',
    keywords: ['ticket macros', 'bulk actions on tickets', 'canned responses'],
    answer: 'Macros are templates for repetitive ticket updates. Assign a macro to a case and it applies all the updates in one click — updates fields, posts a message, whatever you\'ve set up. You can preview what it\'ll do before you run it, and you can create your own custom ones.',
  },
  {
    question: 'how do I set up agent skills for ticket routing',
    keywords: ['agent skills', 'skilled routing', 'expertise tags'],
    answer: 'Tag each team member with skills they have (like "billing", "claims", "renewal"), then set up skill-based assignment rules. Cases automatically route to whoever\'s qualified to handle them. Everyone stays in their wheelhouse.',
  },
  {
    question: 'how do case business rules work',
    keywords: ['case form rules', 'required fields', 'case automation', 'form customization'],
    answer: 'Business rules let you customize the case form. You can make certain fields required if another field has a specific value, or auto-fill fields based on rules. It shapes how your team handles cases without any code.',
  },
  {
    question: 'how do I set a sales quota',
    keywords: ['sales targets', 'quota tracking', 'hitting targets', 'quota attainment'],
    answer: 'Go to Sales Quotas and set a rep\'s target amount for a period. Each rep can see their own progress — the system calculates what they\'ve actually won versus their target and shows the percentage. It\'s motivating and transparent.',
  },
  {
    question: 'how does the loyalty program work',
    keywords: ['customer tiers', 'loyalty points', 'customer levels', 'rewards tiers'],
    answer: 'You can enroll customers in a loyalty tier (Standard, Gold, Platinum, etc.). Their points balance updates live based on transactions — no manual bookkeeping. It\'s great for recognizing your best clients.',
  },
  {
    question: 'how do I add a custom field',
    keywords: ['custom fields', 'adding new fields to accounts', 'custom data fields'],
    answer: 'Go to Custom Fields and add a new one for Accounts, Contacts, Leads, or Opportunities — whatever you need. Choose the field type, and you\'re done. Old data stays safe; you\'re just adding new room to store what\'s important to you.',
  },
  {
    question: 'how do I add a lead source',
    keywords: ['lead source tracking', 'where did this lead come from', 'lead origins'],
    answer: 'Lead Sources are just your list of how leads find you (referral, website, LinkedIn, etc.). Go to Lead Sources and add what you need. When you create a lead, you\'ll pick its source so you can track which channels actually work.',
  },
  {
    question: 'how do I customize my sales pipeline stages',
    keywords: ['pipeline stages', 'pipeline setup', 'changing pipeline stages'],
    answer: 'Go to Pipeline Setup, and you\'ll see your stages. Rename them, reorder them, or add new ones however you like — just drag to rearrange. TopiaDesk updates all your opportunities automatically.',
  },
  {
    question: 'how do I schedule a report to be emailed',
    keywords: ['scheduled reports', 'recurring reports', 'email reports'],
    answer: 'Go to Scheduled Reports and set up any report to run on a schedule — weekly, monthly, whatever works for you. Pick the format (PDF, Excel, CSV), who gets it, and TopiaDesk handles it. No manual work after that.',
  },
  {
    question: 'how do I set up a customer satisfaction survey',
    keywords: ['surveys', 'CSAT', 'feedback surveys', 'post-interaction surveys'],
    answer: 'Under Knowledge/Surveys, you can create survey templates that go out automatically after cases close. Collect feedback from your customers and see what they really think.',
  },
  {
    question: 'how do business hours affect SLA due dates',
    keywords: ['SLA calculation', 'business hours', 'response time', 'working hours'],
    answer: 'Business Hours defines when you actually work (timezone, hours per day, holidays). SLAs then use that to calculate real response-time targets. A 4-hour SLA is 4 business hours, not 4 clock hours. Gives your team realistic targets.',
  },
  {
    question: 'what are carriers',
    keywords: ['insurance carriers', 'underwriters', 'carrier management'],
    answer: 'Carriers are the insurers you work with. Your carrier directory lists them all so you can pick the right one for each policy. You can attach documents like rate sheets, coverage details, everything in one place.',
  },
  {
    question: "how do I check a policy's premium schedule",
    keywords: ['premium payments', 'payment schedule', 'installments'],
    answer: 'Go to Premiums to see the actual payment schedule and history for a policy. It\'s separate from the headline sum insured — a policy might be for $500K but the premium might be split into monthly or quarterly payments.',
  },
  {
    question: 'how do I upload a document to a policy',
    keywords: ['policy documents', 'file management', 'document storage'],
    answer: 'Go to Documents and upload anything related to a policy or account — applications, rate sheets, correspondence, anything. It all stays organized in one place instead of scattered across email.',
  },
  {
    question: 'where do I see approvals waiting on me',
    keywords: ['my approvals', 'approval queue', 'pending approvals'],
    answer: 'Go to My Approvals to see everything that\'s waiting for your sign-off — policy changes, workflow steps, whatever. Nothing gets held up because it slipped your mind.',
  },
  {
    question: 'how do I create a campaign email template',
    keywords: ['email templates', 'campaign templates', 'reusable emails'],
    answer: 'Go to Campaign Templates and build a template once, then reuse it for every campaign. No more starting from scratch. Just customize the subject and send.',
  },
  {
    question: 'how do I bulk upload contacts or accounts',
    keywords: ['bulk import', 'importing data', 'CSV import', 'batch upload'],
    answer: 'Go to Tools > Bulk Import and upload a CSV file with your contacts or accounts. The system maps columns, validates the data, and shows you any errors before committing. You can import hundreds at once.',
  },
  {
    question: 'what are user roles and permissions',
    keywords: ['user access levels', 'permissions', 'admin vs agent', 'role-based access'],
    answer: 'Roles control what each user can see and do. Admin has full access. Sales agents can see leads and opportunities. Support agents see cases. You set permissions per role — it\'s about trust and focus, not locking people out.',
  },
  {
    question: 'how do I export data from TopiaDesk',
    keywords: ['data export', 'exporting to Excel', 'backup data', 'downloading reports'],
    answer: 'Most lists have an Export button. Pick CSV or Excel, and you get the data instantly. Reports can export in PDF, Excel, or CSV. It\'s all yours to take wherever you need it.',
  },
  {
    question: 'how do I set up email sync with my inbox',
    keywords: ['email integration', 'syncing emails', 'connecting email'],
    answer: 'Go to Integrations > Email and connect your email account. Emails to your customers automatically sync to TopiaDesk, so nothing gets lost in an inbox — everything stays in one place.',
  },
  {
    question: 'how do I track email opens and clicks in campaigns',
    keywords: ['email tracking', 'campaign analytics', 'email performance', 'click rates'],
    answer: 'When you send a campaign, the system tracks opens, clicks, and bounces automatically. See which links people clicked and how many actually opened it. It\'s all in the campaign performance tab.',
  },
  {
    question: 'how do I set up an automated workflow',
    keywords: ['workflow automation', 'triggers and actions', 'if-then rules', 'automating tasks'],
    answer: 'Go to Workflows and create a new one. Pick a trigger (like "renewal date is coming") and an action (like "send an email"). The system runs it automatically. No coding needed — just drag and click.',
  },
  {
    question: 'how do I manage team capacity and workload',
    keywords: ['team load balancing', 'agent capacity', 'workload management'],
    answer: 'Use the Team Workload report to see who\'s buried and who has bandwidth. Reassign cases from overloaded agents to others. The system can also auto-balance new cases based on current load.',
  },
  {
    question: 'how do I use templates for policy documents',
    keywords: ['document templates', 'policy agreements', 'generated documents'],
    answer: 'Go to Document Templates and create one for quotes, renewals, whatever you send regularly. Fill in the blanks (client name, premium, dates) and the system generates a PDF ready to sign.',
  },
  {
    question: 'how do I see who accessed my account data',
    keywords: ['audit trail', 'activity log', 'who changed what', 'compliance log'],
    answer: 'Go to Settings > Audit Trail to see who made changes and when. It\'s immutable — you can\'t erase it. Perfect for compliance and troubleshooting.',
  },
  {
    question: 'how do I set up a two-factor authentication',
    keywords: ['2FA', 'security setup', 'MFA', 'login security'],
    answer: 'Go to Settings > Security and enable Two-Factor Authentication. You\'ll get a code on your phone every time you log in. It takes 10 seconds but stops most break-ins cold.',
  },
  {
    question: 'how do I integrate with Slack',
    keywords: ['Slack integration', 'Slack notifications', 'TopiaDesk in Slack'],
    answer: 'Go to Integrations > Slack and connect your workspace. Set up notifications for important events — new cases, due renewals, whatever matters. You\'ll see alerts right in Slack without leaving the app.',
  },
  {
    question: 'how do I use the mobile app',
    keywords: ['mobile app', 'iOS app', 'Android app', 'mobile access'],
    answer: 'Download TopiaDesk from the App Store or Google Play. Log in with your regular credentials. You can check your pipeline, see cases, log activities — all from your phone. It syncs with your desktop instantly.',
  },
  {
    question: 'how do I create a saved search',
    keywords: ['saved filters', 'smart views', 'search templates'],
    answer: 'Build a search (filter by status, date range, whatever), then click "Save Search". Give it a name and it appears in your sidebar forever. No more rebuilding the same search every day.',
  },
  {
    question: 'how do I handle time zones for my global team',
    keywords: ['time zone settings', 'international teams', 'scheduling across zones'],
    answer: 'Each user has a Time Zone in their profile. Meetings, deadlines, and SLAs all respect it. So if you\'re in New York and a London agent gets a 4-hour SLA, it\'s 4 London hours, not New York time.',
  },
  {
    question: 'how do I generate a quote for a client',
    keywords: ['quote creation', 'quotation', 'pricing quote'],
    answer: 'Go to Quotes and click "New Quote". Pick the client, products or policies they\'re interested in, and the system calculates premium and costs. Send it as a PDF or email link — they can accept right from there.',
  },
  {
    question: 'how do I merge duplicate accounts',
    keywords: ['duplicate accounts', 'consolidating accounts', 'merging clients'],
    answer: 'If you find a duplicate, open one account and go to More > Merge. Pick which policies, contacts, and data to keep. Everything gets combined into one clean account.',
  },
  {
    question: 'how do I set up recurring tasks for my team',
    keywords: ['recurring tasks', 'repeating tasks', 'task automation'],
    answer: 'Create a Task and check "Recurring". Pick a frequency (daily, weekly, monthly) and when it should stop. The system creates a new task automatically each time without you lifting a finger.',
  },
  {
    question: 'how do I see real-time notifications',
    keywords: ['notifications', 'alerts', 'getting notified'],
    answer: 'Go to Settings > Notifications and pick what you care about — cases assigned to you, renewals due, approvals waiting. You\'ll get a browser notification instantly. No more missing important things.',
  },
  {
    question: 'how do I create a team directory',
    keywords: ['team contacts', 'agent directory', 'who to call'],
    answer: 'Your team directory is built-in. Go to People and you\'ll see everyone\'s name, email, and phone. Click anyone to see their skills or which cases they\'re handling.',
  },
  {
    question: 'how do I track competitor activity',
    keywords: ['competitive intelligence', 'market tracking', 'competitor notes'],
    answer: 'There\'s a Competitors section where you can log who your competitors are. On each account, you can see which competitors have quoted them or are trying to win their business.',
  },
  {
    question: 'how do I use conditional formatting in reports',
    keywords: ['report formatting', 'highlighting data', 'color coding'],
    answer: 'When you build a custom report, you can set rules like "show values over $1M in green" or "values under $500K in red". It makes trends jump out without reading every number.',
  },
  {
    question: 'how do I set up billing or invoice tracking',
    keywords: ['invoicing', 'billing', 'payment tracking', 'client billing'],
    answer: 'Go to Billing and create invoices for clients. You can auto-generate them from policies or manually. Track payment status and send reminders for overdue amounts.',
  },
  {
    question: 'how do I get API access for integrations',
    keywords: ['API key', 'API documentation', 'webhook setup', 'third-party integrations'],
    answer: 'Go to Settings > API and generate an API key. Read the documentation at docs.topiadesk.com to build custom integrations. Webhooks let you listen for events in real-time.',
  },
  {
    question: 'how do I set up automatic backups',
    keywords: ['data backup', 'backup schedule', 'data safety'],
    answer: 'Backups happen automatically every night. You can\'t lose data — we keep 30 days of historical snapshots. You can\'t turn it off; it\'s for your protection.',
  },
  {
    question: 'how do I handle seasonal business spikes',
    keywords: ['peak seasons', 'seasonal workload', 'hiring temporary help'],
    answer: 'Most brokers hire contractors during peak season. TopiaDesk lets you add temp users quickly without setting up full accounts. When the season ends, deactivate them and they\'re gone.',
  },
  {
    question: 'how do I avoid policy lapses through automation',
    keywords: ['renewal automation', 'lapse prevention', 'preventing lapses'],
    answer: 'Set up a workflow that triggers 60 days before renewal. Have it email you, assign a task to an agent, or even generate a quote automatically. The system can\'t let policies slip through anymore.',
  },
  {
    question: 'how do I get training on TopiaDesk',
    keywords: ['training resources', 'learning TopiaDesk', 'getting help', 'onboarding'],
    answer: 'We have video tutorials, live webinars, and one-on-one support. Check the Help > Training section or email support@topiadesk.com to book a session.',
  },
];


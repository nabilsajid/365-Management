// The team guide pinned to the notice board (Updates → Announcements). Written
// for people joining the company; admin access is only summarised.

export interface GuideSection {
  id: string;
  title: string;
  intro?: string;
  points: string[];
}

export const TEAM_GUIDE: GuideSection[] = [
  {
    id: 'start',
    title: 'Your first day',
    intro: 'Welcome to UniDock, the app where the company keeps its projects, tasks, attendance, points and updates in one place.',
    points: [
      'Sign in with the email and password your admin gave you. If you forget your password, press "Forgot password?" on the sign-in page: your admin is asked to set a new one for you.',
      'The first time you sign in, fill in your profile: your full name, a nickname, your contact number (a Bangladeshi number that starts with 01 and has 11 digits), your address and a second contact. Your name and number are visible to the team; your address and second contact only to you and the admins.',
      'Once your profile is saved, a welcome pop-up offers this guide. It is always here afterwards, pinned at the top of Updates → Announcements.',
      'Install the app: press "Install the app" (on the sign-in page or at the top of the app). It then opens from your home screen or taskbar like any other app and stays signed in.',
      'Turn on device alerts under Profiles & Contacts → My profile, so new assignments and messages reach your phone even when the app is closed.',
      'Add a profile photo under Profiles & Contacts → My profile: upload it, drag and zoom to fit your face in the circle, and save.',
    ],
  },
  {
    id: 'layout',
    title: 'Finding your way around',
    points: [
      'The menu on the left (on a phone, swipe right from the left edge or press ☰) lists the sections your role can open. Different roles see different sections.',
      'Dashboard: your points this month, your tasks, and the latest announcements.',
      'The search box at the top finds anything as you type: pages, projects, tasks, people, clients, costs, equipment, announcements, messages, comments and leave.',
      'Use the moon/sun switch at the top to change between dark and light mode.',
      'A number beside a menu item means something is waiting for you there.',
    ],
  },
  {
    id: 'roles',
    title: 'Roles: what you can see and do',
    intro: 'Everyone has one or more roles (the coloured tags beside names). Your roles decide which sections you can open, and whether you can only view them or also change things.',
    points: [
      'Everyone can: see their dashboard, work on the projects they are assigned to, submit work, comment, mark their attendance, see their own points, ask for leave, add their own travel costs, ask for equipment, send a broadcast to the admins and read announcements.',
      'Project Manager: sees every project and can create and change projects, deliverables and teams.',
      'Finance Manager: sees cash flow and invoices, costs and team bonuses.',
      'Human Resource: sees everyone\'s attendance, points and bonuses, and can give or deduct points (an admin approves them).',
      'Logistics Manager: manages the equipment list, what is needed, and fixed and transport costs.',
      'Operations Manager: projects, equipment and costs together.',
      'Graphic Designer, Senior Graphic Designer, Video Editor, Senior Visualizer: work on the deliverables assigned to them.',
      'Trainee: can look around (projects, their own tasks, points and equipment) but cannot change anything.',
      'Admin: holds the highest possible access and approves requests from everyone else.',
      'Some changes you make go to an admin for approval first. You can follow them under My Requests.',
    ],
  },
  {
    id: 'tasks',
    title: 'Projects and your tasks',
    points: [
      'When you are assigned to a project or a deliverable you get a notification and a pop-up the next time you open the app. Everything assigned to you is under My Tasks.',
      'Your tasks move through To do → In progress → In review → Done. Press "Start" on a task in My Tasks (or "Start working" on the task) when you begin; it goes to In review when you submit work, and to Done when it is approved.',
      'Open a task to see the brief, due date and links. When your work is ready, use "Submit work" with a Google Drive or Dropbox link (or a text note). Files are never uploaded into the app: always share them as a link.',
      'The reviewer either approves it or asks for changes with a note. You are told either way.',
      'Deadlines: a task due within two days gets an amber "Due tomorrow" or "Due in 2 days" mark, and a red one when it is due today or overdue. A red number on My Tasks in the menu counts these. The day before a deadline you get a reminder; if it is missed, you and the admins are told.',
      'Shoots: two days before a shoot that the client has not confirmed yet, the team and the admins are reminded.',
      'Comment on a task or project to ask questions. Write @ and someone\'s first name or nickname (for example @Rafi) to notify them.',
      'Projects show the client, team, links, shoot date (or "waiting for client confirmation") and every deliverable: videos, thumbnails, graphics and shoots.',
      'When your work is approved, or a project you worked on is completed, you get fireworks and a "Well done!" on your screen. The admin then gives points for completed projects.',
      'Projects are either one-time jobs or monthly clients. A monthly client is one project that stays open, with a tab for each month. Each month has its own tasks (each video, thumbnail, photo or post is one task, assigned to someone), and a Delivered list counts what was approved, against the fixed number when the client has one.',
      'If something on your task or project changes (notes, points, due date, links, brief), you get a notification saying what changed.',
      'The Calendar shows due dates, shoots and leave for the month.',
      'Finished projects may be hidden to keep things tidy. Their tasks leave My Tasks and the calendar, but nothing is lost: Projects → "Show hidden projects" lists them with the month they finished, and opening one shows everything inside.',
      'To take leave, ask on the Leave page. Admins and HR are notified and approve or deny it, and you get a notification with the answer.',
    ],
  },
  {
    id: 'points',
    title: 'Attendance and points',
    points: [
      'Every working day, mark your attendance under Employees & Rewards → Attendance with your entry and exit time. Once an admin verifies the day, you earn attendance points.',
      'Points start from zero on the 1st of every month. Earlier months are kept and you can look back at them with the month picker.',
      'Some companies switch off points; then this part of the app is not shown.',
      'Payslips: once your salary for a month is paid, its payslip appears under Profiles & Contacts → My profile → My payslips. Open it to print or save it as a PDF.',
      'You earn points for verified days, approved work and good work recognised by the admin (for example extra hours or great client feedback). Points can be deducted for violations such as coming late.',
      'Reach the monthly target to qualify for a bonus. Bonuses are approved by the admin. Deductions never reduce your salary.',
      'Your points page shows a statement of exactly how you earned or lost each point this month.',
    ],
  },
  {
    id: 'leave',
    title: 'Leave',
    points: [
      'Ask for leave under Leave: choose the dates and write the reason.',
      'An admin or HR approves or declines it and you are notified. Approved leave shows on the Calendar and next to attendance.',
      'Pick a month at the top of the Leave page to see that month\'s leave.',
    ],
  },
  {
    id: 'costs',
    title: 'Travel costs and equipment',
    points: [
      'Spent money on transport for work? Add it under Equipment & Costs → Travel costs: where you went from and to, the amount, and what it was for (pick the project or client, or write the purpose, such as a new client meeting). It is recorded under your name.',
      'Small costs may be accepted straight away; others wait for an admin. Follow them under My Requests.',
      'Need something (a camera battery, a tripod)? Add it under Equipment & Costs → Needed items so the logistics team sees it.',
      'Taking equipment out (a camera for a shoot, for example)? Ask under Equipment & Costs → Checkouts: choose the item, what it is for, and when you will bring it back. Once approved it is recorded under your name. Press "Mark returned" when you bring it back; if it is late, you get a reminder.',
    ],
  },
  {
    id: 'updates',
    title: 'Updates, broadcasts and messages',
    points: [
      'Announcements: news for everyone from the admins. Urgent ones are marked and also show on your dashboard.',
      'Broadcasts: send a short, urgent message to the admins (for example "Client wants the shoot moved to tomorrow").',
      'Messages: personal messages an admin sends only to you. Mark them done once handled.',
      'Choose which notifications you get under Profiles & Contacts → My profile → Notifications.',
    ],
  },
  {
    id: 'offline',
    title: 'Using it with a weak connection',
    points: [
      'Pages you have opened before still open without internet, and a bar at the top tells you that you are offline.',
      'Things you add while offline (attendance, comments, costs and similar) are kept on your device and sent automatically when you are back online.',
    ],
  },
  {
    id: 'help',
    title: 'Getting help',
    points: [
      'Something wrong or unclear? Send a broadcast to the admins, or message your admin directly.',
      'Never share your password. If you think someone knows it, ask your admin to set a new one.',
    ],
  },
];

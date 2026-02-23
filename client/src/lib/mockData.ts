import { 
  LayoutDashboard, 
  Inbox, 
  Zap, 
  Users, 
  FileText, 
  Settings, 
  LogOut,
  Bell,
  Search,
  Menu
} from "lucide-react";

export const currentUser = {
  name: "Sarah Chen",
  email: "sarah@designstudio.com",
  avatar: "https://i.pravatar.cc/150?u=a042581f4e29026704d",
  role: "Admin",
  company: "Lumina Design Studio"
};

export const stats = [
  { label: "Emails Processed", value: "1,248", change: "+12%", trend: "up" },
  { label: "Hours Saved", value: "42.5", change: "+8%", trend: "up" },
  { label: "Active Automations", value: "8", change: "0%", trend: "neutral" },
  { label: "Revenue Generated", value: "$12,450", change: "+24%", trend: "up" },
];

export const emails = [
  {
    id: 1,
    from: "alex@techstart.io",
    subject: "Project Quote Request - Mobile App",
    preview: "Hi Sarah, we're looking for a design partner for our new mobile app...",
    date: "10:30 AM",
    status: "AI Drafted",
    priority: "High",
    category: "Lead",
    sentiment: "Positive"
  },
  {
    id: 2,
    from: "billing@servercloud.com",
    subject: "Invoice #49201 Overdue",
    preview: "Your payment for last month's hosting is overdue. Please settle...",
    date: "09:15 AM",
    status: "Needs Review",
    priority: "Medium",
    category: "Finance",
    sentiment: "Negative"
  },
  {
    id: 3,
    from: "jessica@client.com",
    subject: "Feedback on V2 Designs",
    preview: "Loved the new direction! Just a few small tweaks on the hero section...",
    date: "Yesterday",
    status: "Processed",
    priority: "Medium",
    category: "Client Work",
    sentiment: "Positive"
  },
  {
    id: 4,
    from: "newsletter@designweekly.com",
    subject: "Top 10 Trends for 2025",
    preview: "In this week's issue, we explore the return of skeletal interfaces...",
    date: "Yesterday",
    status: "Archived",
    priority: "Low",
    category: "Newsletter",
    sentiment: "Neutral"
  }
];

export const automations = [
  {
    id: 1,
    name: "New Lead Responder",
    description: "Auto-replies to quote requests and creates a CRM entry",
    active: true,
    triggers: ["Email subject contains 'Quote'", "Email subject contains 'Price'"],
    actions: ["Draft Reply", "Create Deal in CRM", "Notify Slack"]
  },
  {
    id: 2,
    name: "Invoice Reminder",
    description: "Follows up on unpaid invoices after 3 days",
    active: true,
    triggers: ["Invoice status is 'Overdue'"],
    actions: ["Send Email", "Update Status"]
  },
  {
    id: 3,
    name: "Meeting Scheduler",
    description: "Suggests times when a client asks for a call",
    active: false,
    triggers: ["Email body contains 'meet'", "Email body contains 'call'"],
    actions: ["Check Calendar", "Draft Reply with Slots"]
  }
];

export const customers = [
  {
    id: 1,
    name: "TechStart Inc",
    contact: "Alex Rivera",
    email: "alex@techstart.io",
    status: "Active",
    value: "$45,000",
    lastInteraction: "2 hours ago"
  },
  {
    id: 2,
    name: "Global Logistics",
    contact: "Maria Chen",
    email: "m.chen@globallogistics.com",
    status: "Negotiation",
    value: "$12,500",
    lastInteraction: "1 day ago"
  },
  {
    id: 3,
    name: "Fresh Foods Market",
    contact: "David Miller",
    email: "dave@freshfoods.com",
    status: "Active",
    value: "$8,200",
    lastInteraction: "3 days ago"
  }
];

export const invoices = [
  {
    id: "INV-2024-001",
    client: "TechStart Inc",
    amount: "$4,500.00",
    date: "Feb 15, 2024",
    status: "Paid"
  },
  {
    id: "INV-2024-002",
    client: "Global Logistics",
    amount: "$2,100.00",
    date: "Feb 18, 2024",
    status: "Pending"
  },
  {
    id: "INV-2024-003",
    client: "Fresh Foods Market",
    amount: "$850.00",
    date: "Feb 10, 2024",
    status: "Overdue"
  }
];

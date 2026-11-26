/**
 * Scripted scenes for the home page demonstration. Everything here is illustrative: no model is
 * called and none of the data is real. The page says so next to the demo.
 */
export interface Chip {
  label: string;
  value: string;
}
export interface AppRow {
  title: string;
  meta: string;
  tag?: string;
  active?: boolean;
}
export interface AppView {
  site: string;
  heading: string;
  filters: Chip[];
  rows: AppRow[];
  summary?: { label: string; value: string; cta: string };
}
/** The seven steps shown for every request, in order: label, then what happened. */
export type Trace = [string, string][];
export interface Turn {
  say: string;
  lang?: "te";
  trace: Trace;
  view: AppView;
  reply: string;
}
export interface Industry {
  id: string;
  label: string;
  start: AppView;
  turns: Turn[];
}

const STEPS = [
  "intent resolved",
  "capability selected",
  "arguments validated",
  "permissions checked",
  "service executed",
  "application updated",
  "outcome recorded",
] as const;

function trace(values: [string, string, string, string, string, string, string]): Trace {
  return STEPS.map((step, i) => [step, values[i] ?? ""]);
}

export const INDUSTRIES: Industry[] = [
  {
    id: "commerce",
    label: "E-commerce",
    start: {
      site: "northwind.shop/clothing",
      heading: "Clothing",
      filters: [
        { label: "Category", value: "All" },
        { label: "Max price", value: "Any" },
        { label: "Color", value: "Any" },
      ],
      rows: [
        { title: "Linen shirt", meta: "₹1,299", tag: "Blue" },
        { title: "Denim jacket", meta: "₹2,499", tag: "Indigo" },
        { title: "Canvas sneakers", meta: "₹1,799", tag: "White" },
      ],
    },
    turns: [
      {
        say: "Show me black T-shirts under ₹500.",
        trace: trace([
          "find_products",
          "products.search · read",
          'category="t-shirts" color="black" max=500',
          "public catalogue · no confirmation",
          "GET /api/products?category=t-shirts&color=black",
          "3 filters set · 3 results",
          "turn written to the audit log",
        ]),
        view: {
          site: "northwind.shop/clothing",
          heading: "Clothing",
          filters: [
            { label: "Category", value: "T-shirts" },
            { label: "Max price", value: "₹500" },
            { label: "Color", value: "Black" },
          ],
          rows: [
            { title: "Black crew tee", meta: "₹399", tag: "In stock" },
            { title: "Black pocket tee", meta: "₹449", tag: "In stock" },
            { title: "Black relaxed tee", meta: "₹499", tag: "In stock" },
          ],
        },
        reply: "Here are 3 black T-shirts under ₹500.",
      },
      {
        say: "Buy two of the second one in size L.",
        trace: trace([
          "add_to_cart",
          "cart.add · write",
          'product="black-pocket-tee" qty=2 size="L"',
          "write action · visitor must confirm",
          "POST /api/cart (after Yes)",
          "cart prepared · checkout opened",
          "approval and result audited",
        ]),
        view: {
          site: "northwind.shop/cart",
          heading: "Your cart",
          filters: [
            { label: "Item", value: "Black pocket tee" },
            { label: "Size", value: "L" },
            { label: "Qty", value: "2" },
          ],
          rows: [{ title: "Black pocket tee", meta: "2 × ₹449", tag: "Size L", active: true }],
          summary: { label: "Subtotal", value: "₹898", cta: "Continue to secure checkout" },
        },
        reply: "Two in size L are ready. Confirm to go to checkout.",
      },
    ],
  },
  {
    id: "education",
    label: "Education",
    start: {
      site: "learn.example.app/questions",
      heading: "Question bank",
      filters: [
        { label: "Subject", value: "All" },
        { label: "Topic", value: "All" },
      ],
      rows: [
        { title: "Process scheduling, round robin", meta: "Operating systems", tag: "GATE" },
        { title: "Binary tree traversal", meta: "Data structures", tag: "GATE" },
        { title: "TCP congestion control", meta: "Networks", tag: "GATE" },
      ],
    },
    turns: [
      {
        say: "నాకు DBMS లో normalization questions చూపించు.",
        lang: "te",
        trace: trace([
          "find_questions",
          "questions.search · read",
          'subject="DBMS" topic="Normalization"',
          "public question bank · no confirmation",
          "GET /api/questions?subject=dbms&topic=normalization",
          "subject and topic set · 3 results",
          "turn written to the audit log",
        ]),
        view: {
          site: "learn.example.app/questions",
          heading: "Question bank",
          filters: [
            { label: "Subject", value: "DBMS" },
            { label: "Topic", value: "Normalization" },
          ],
          rows: [
            {
              title: "Which normal form removes transitive dependency?",
              meta: "DBMS · Normalization",
              tag: "3NF",
            },
            { title: "Decompose R(A,B,C,D) into BCNF", meta: "DBMS · Normalization", tag: "BCNF" },
            {
              title: "Find the highest normal form of the relation",
              meta: "DBMS · Normalization",
              tag: "2NF",
            },
          ],
        },
        reply: "DBMS లో normalization ప్రశ్నలు ఇవిగో.",
      },
    ],
  },
  {
    id: "logistics",
    label: "Logistics",
    start: {
      site: "track.example.app/shipments",
      heading: "My shipments",
      filters: [
        { label: "Status", value: "All" },
        { label: "Owner", value: "You" },
      ],
      rows: [
        { title: "Shipment 2036", meta: "Chennai → Pune", tag: "Delivered" },
        { title: "Shipment 2041", meta: "Hyderabad → Pune", tag: "In transit" },
        { title: "Shipment 2078", meta: "Mumbai → Delhi", tag: "In transit" },
      ],
    },
    turns: [
      {
        say: "Show all my delayed shipments.",
        trace: trace([
          "list_shipments",
          "shipments.list · read",
          'status="delayed" owner=current_user',
          "signed in · own shipments only",
          "GET /api/shipments?status=delayed",
          "status filter set · 2 results",
          "turn written to the audit log",
        ]),
        view: {
          site: "track.example.app/shipments",
          heading: "My shipments",
          filters: [
            { label: "Status", value: "Delayed" },
            { label: "Owner", value: "You" },
          ],
          rows: [
            { title: "Shipment 2041", meta: "Hyderabad → Pune · +2 days", tag: "Delayed" },
            { title: "Shipment 2078", meta: "Mumbai → Delhi · customs hold", tag: "Delayed" },
          ],
        },
        reply: "You have 2 delayed shipments. Tracking details are open.",
      },
    ],
  },
  {
    id: "healthcare",
    label: "Healthcare",
    start: {
      site: "clinic.example.app/appointments",
      heading: "Book an appointment",
      filters: [
        { label: "Department", value: "Any" },
        { label: "Date", value: "Any" },
      ],
      rows: [
        { title: "General medicine", meta: "Next opening: Thu", tag: "Open" },
        { title: "Dermatology", meta: "Next opening: Fri", tag: "Open" },
      ],
    },
    turns: [
      {
        say: "Show available cardiologists tomorrow.",
        trace: trace([
          "find_slots",
          "appointments.search · read",
          'department="cardiology" date=tomorrow',
          "public schedule · no patient data",
          "GET /api/slots?department=cardiology",
          "department and date set · 3 slots",
          "turn written to the audit log",
        ]),
        view: {
          site: "clinic.example.app/appointments",
          heading: "Book an appointment",
          filters: [
            { label: "Department", value: "Cardiology" },
            { label: "Date", value: "Tomorrow" },
          ],
          rows: [
            { title: "Cardiologist A", meta: "10:30 AM", tag: "Available" },
            { title: "Cardiologist B", meta: "12:00 PM", tag: "Available" },
            { title: "Cardiologist A", meta: "4:15 PM", tag: "Available" },
          ],
          summary: { label: "Next step", value: "Review before booking", cta: "Choose a slot" },
        },
        reply: "Three cardiology slots are open tomorrow. Pick one to review.",
      },
    ],
  },
  {
    id: "finance",
    label: "Financial services",
    start: {
      site: "bank.example.app/transactions",
      heading: "Transactions",
      filters: [
        { label: "Range", value: "Last 7 days" },
        { label: "Account", value: "Primary" },
      ],
      rows: [
        { title: "Utility bill", meta: "−₹1,860", tag: "Mon" },
        { title: "Salary credit", meta: "+₹52,000", tag: "Sat" },
      ],
    },
    turns: [
      {
        say: "Show my transactions from last month.",
        trace: trace([
          "list_transactions",
          "transactions.list · read",
          "range=previous_month account=primary",
          "signed in · own account only",
          "GET /api/transactions?range=previous_month",
          "date range set · 3 records",
          "turn written to the audit log",
        ]),
        view: {
          site: "bank.example.app/transactions",
          heading: "Transactions",
          filters: [
            { label: "Range", value: "Last month" },
            { label: "Account", value: "Primary" },
          ],
          rows: [
            { title: "Rent", meta: "−₹18,000", tag: "1st" },
            { title: "Salary credit", meta: "+₹52,000", tag: "28th" },
            { title: "Groceries", meta: "−₹2,420", tag: "14th" },
          ],
          summary: { label: "Net for the month", value: "+₹31,580", cta: "Download statement" },
        },
        reply: "Here are last month’s transactions from your primary account.",
      },
    ],
  },
];

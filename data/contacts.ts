import type { Contact, ContactList } from "@/types";

const firstNames = [
  "Aarav", "Diya", "Rohan", "Isha", "Kabir", "Meera", "Arjun", "Sana",
  "Vivek", "Nisha", "Aditya", "Priya", "Karan", "Tara", "Rahul", "Ananya",
  "Farhan", "Neha", "Siddharth", "Riya", "Manav", "Pooja", "Yash", "Sneha",
];

const lastNames = [
  "Sharma", "Verma", "Nair", "Reddy", "Kapoor", "Iyer", "Singh", "Joshi",
  "Mehta", "Bose", "Khan", "Patel",
];

const tagPool = ["new-customer", "vip", "cart-abandoner", "repeat-buyer", "newsletter", "offline-store"];
const sources = ["Website form", "CSV import", "In-store QR", "Landing page", "Referral"];

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export const contacts: Contact[] = Array.from({ length: 64 }, (_, i) => {
  const first = firstNames[i % firstNames.length];
  const last = lastNames[(i * 5) % lastNames.length];
  const consent: Contact["consent"] =
    i % 11 === 0 ? "opted_out" : i % 7 === 0 ? "pending" : "opted_in";
  return {
    id: `ct${i + 1}`,
    name: `${first} ${last}`,
    phone: `+91 9${(700000000 + i * 137911).toString().slice(0, 9)}`,
    email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
    tags: [tagPool[i % tagPool.length], ...(i % 4 === 0 ? [tagPool[(i + 2) % tagPool.length]] : [])],
    consent,
    consentSource: sources[i % sources.length],
    consentDate: `2026-0${(i % 8) + 1}-${pad((i % 27) + 1)}`,
    createdAt: `2026-0${(i % 8) + 1}-${pad((i % 27) + 1)}`,
    lastMessageAt: i % 3 === 0 ? `2026-09-${pad((i % 14) + 1)}` : undefined,
  };
});

export const contactLists: ContactList[] = [
  { id: "l1", name: "All opted-in contacts", count: 8104, source: "System list", updatedAt: "2026-09-14" },
  { id: "l2", name: "Festive campaign 2026", count: 3240, source: "CSV import", updatedAt: "2026-09-10" },
  { id: "l3", name: "Cart abandoners (30 days)", count: 912, source: "Segment", updatedAt: "2026-09-12" },
  { id: "l4", name: "Store walk-ins — Delhi", count: 540, source: "Excel import", updatedAt: "2026-08-29" },
  { id: "l5", name: "VIP customers", count: 186, source: "Manual", updatedAt: "2026-09-01" },
];

export const messageHistory = [
  { id: "m1", campaign: "Festive Drop 2026", status: "read", date: "2026-09-12 10:24" },
  { id: "m2", campaign: "Order update — #48219", status: "delivered", date: "2026-09-04 17:02" },
  { id: "m3", campaign: "Monsoon Sale", status: "read", date: "2026-08-18 09:40" },
];

import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { ts } from "./_cols";
import { legacyFreelancers } from "./core";
import { companies } from "./crm";
import { agencies } from "./team";

// Tables required by Better Auth (drizzle adapter, pg provider).
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("MEMBER"),
  orgId: text("org_id").notNull().default("default"),
  freelancerId: text("freelancer_id"),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull(),
}).enableRLS();

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: ts("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
}).enableRLS();

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: ts("access_token_expires_at"),
  refreshTokenExpiresAt: ts("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull(),
}).enableRLS();

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull(),
}).enableRLS();

/**
 * Who may sign in, and as what. Outside people are linked to one record: a client to a company,
 * a freelancer to a freelancer, a partner agency to an agency. Deleting that record removes the row,
 * which ends their access.
 */
export const allowedEmails = pgTable("allowed_emails", {
  email: text("email").primaryKey(),
  orgId: text("org_id").notNull().default("default"),
  role: text("role").notNull().default("MEMBER"),
  companyId: text("company_id").references(() => companies.id, { onDelete: "cascade" }),
  freelancerId: text("freelancer_id").references(() => legacyFreelancers.id, { onDelete: "cascade" }),
  agencyId: text("agency_id").references(() => agencies.id, { onDelete: "cascade" }),
  createdBy: text("created_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
}).enableRLS();

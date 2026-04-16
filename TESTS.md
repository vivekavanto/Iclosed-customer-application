# iClosed Customer Application - Test Plan

## Setup

Tests use **Jest 30** with `@testing-library/jest-dom`. Run all tests with:

```bash
npx jest
```

Run a specific test file:

```bash
npx jest __tests__/api/auth/login.test.ts
```

Run tests in watch mode:

```bash
npx jest --watch
```

### Mock Setup

All API route tests require mocking Supabase and Next.js internals:

```ts
// __tests__/helpers/mocks.ts
import { NextRequest } from "next/server";

export const mockSupabaseAdmin = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  neq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  is: jest.fn().mockReturnThis(),
  ilike: jest.fn().mockReturnThis(),
  not: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn(),
  maybeSingle: jest.fn(),
};

jest.mock("@/lib/supabaseAdmin", () => ({
  __esModule: true,
  default: mockSupabaseAdmin,
}));

export const mockGetAuthClient = jest.fn();
jest.mock("@/lib/getAuthClient", () => ({
  getAuthClient: mockGetAuthClient,
}));

export function buildRequest(url: string, options?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3000"), options);
}

export const mockClient = {
  id: "client-uuid-1",
  email: "john@example.com",
  first_name: "John",
  last_name: "Doe",
  phone: "(416) 555-1234",
  auth_user_id: "auth-uuid-1",
};
```

---

## TDD (Unit & Integration Tests)

### Authentication

```ts
// __tests__/api/auth/login.test.ts
import { POST } from "@/app/api/auth/login/route";
import { mockSupabaseAdmin, buildRequest } from "../helpers/mocks";

jest.mock("@supabase/ssr", () => ({
  createServerClient: jest.fn(() => ({
    auth: {
      signInWithPassword: jest.fn(),
    },
  })),
}));

jest.mock("next/headers", () => ({
  cookies: jest.fn(() => ({
    getAll: jest.fn(() => []),
    set: jest.fn(),
  })),
}));

describe("POST /api/auth/login", () => {
  it("returns session token for valid credentials", async () => {
    const { createServerClient } = require("@supabase/ssr");
    createServerClient.mockReturnValue({
      auth: {
        signInWithPassword: jest.fn().mockResolvedValue({
          data: { user: { id: "auth-uuid-1", email: "john@example.com" } },
          error: null,
        }),
      },
    });
    mockSupabaseAdmin.single.mockResolvedValue({
      data: { id: "client-uuid-1", email: "john@example.com" },
      error: null,
    });

    const req = buildRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "john@example.com", password: "password123" }),
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.user).toBeDefined();
  });

  it("returns 401 for invalid credentials", async () => {
    const { createServerClient } = require("@supabase/ssr");
    createServerClient.mockReturnValue({
      auth: {
        signInWithPassword: jest.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "Invalid login credentials" },
        }),
      },
    });

    const req = buildRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "john@example.com", password: "wrong" }),
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
  });

  it("links auth user to existing client record by email", async () => {
    const { createServerClient } = require("@supabase/ssr");
    createServerClient.mockReturnValue({
      auth: {
        signInWithPassword: jest.fn().mockResolvedValue({
          data: { user: { id: "auth-uuid-1", email: "john@example.com" } },
          error: null,
        }),
      },
    });
    mockSupabaseAdmin.single.mockResolvedValue({
      data: { id: "client-uuid-1", email: "john@example.com", auth_user_id: null },
      error: null,
    });

    const req = buildRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "john@example.com", password: "password123" }),
    });
    await POST(req);

    expect(mockSupabaseAdmin.update).toHaveBeenCalled();
    expect(mockSupabaseAdmin.eq).toHaveBeenCalledWith("id", "client-uuid-1");
  });

  it("triggers welcome email on first login if not yet sent", async () => {
    const sendWelcomeEmail = jest.fn().mockResolvedValue(undefined);
    jest.mock("@/lib/sendWelcomeEmail", () => ({ sendWelcomeEmail }));

    const { createServerClient } = require("@supabase/ssr");
    createServerClient.mockReturnValue({
      auth: {
        signInWithPassword: jest.fn().mockResolvedValue({
          data: { user: { id: "auth-uuid-1", email: "john@example.com" } },
          error: null,
        }),
      },
    });
    // Lead with welcome_email_sent = false
    mockSupabaseAdmin.single.mockResolvedValue({
      data: { id: "lead-1", welcome_email_sent: false },
      error: null,
    });

    const req = buildRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "john@example.com", password: "password123" }),
    });
    await POST(req);

    expect(sendWelcomeEmail).toHaveBeenCalled();
  });
});
```

```ts
// __tests__/api/auth/logout.test.ts
import { POST } from "@/app/api/auth/logout/route";
import { buildRequest } from "../helpers/mocks";

describe("POST /api/auth/logout", () => {
  it("clears session cookies and returns success", async () => {
    const req = buildRequest("/api/auth/logout", { method: "POST" });
    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
  });
});
```

```ts
// __tests__/api/auth/me.test.ts
import { GET } from "@/app/api/auth/me/route";
import { mockGetAuthClient, mockClient, buildRequest } from "../helpers/mocks";

describe("GET /api/auth/me", () => {
  it("returns authenticated user profile", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);

    const req = buildRequest("/api/auth/me");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.email).toBe("john@example.com");
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthClient.mockResolvedValue(null);

    const req = buildRequest("/api/auth/me");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });
});
```

```ts
// __tests__/api/auth/welcome-email.test.ts
import { POST } from "@/app/api/auth/welcome-email/route";
import { buildRequest } from "../helpers/mocks";

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: jest.fn().mockResolvedValue({ id: "email-id-1" }),
    },
  })),
}));

describe("POST /api/auth/welcome-email", () => {
  it("sends welcome email via Resend", async () => {
    const req = buildRequest("/api/auth/welcome-email", {
      method: "POST",
      body: JSON.stringify({ email: "john@example.com", name: "John" }),
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
  });

  it("fails gracefully if email service is down", async () => {
    const { Resend } = require("resend");
    Resend.mockImplementation(() => ({
      emails: {
        send: jest.fn().mockRejectedValue(new Error("Service unavailable")),
      },
    }));

    const req = buildRequest("/api/auth/welcome-email", {
      method: "POST",
      body: JSON.stringify({ email: "john@example.com", name: "John" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(500);
  });
});
```

### Intake API

```ts
// __tests__/api/intake/intake.test.ts
import { POST } from "@/app/api/intake/route";
import { mockSupabaseAdmin, mockGetAuthClient, mockClient, buildRequest } from "../helpers/mocks";

describe("POST /api/intake", () => {
  beforeEach(() => jest.clearAllMocks());

  const validPayload = {
    first_name: "John",
    last_name: "Doe",
    email: "john@example.com",
    phone: "(416) 555-1234",
    service: "Property Closing",
    sub_service: "Buy",
    price: 500000,
    address_street: "123 Main St",
    address_city: "Toronto",
    address_province: "ON",
    address_postal_code: "M5V 1A1",
    aps_signed: true,
    co_persons: [],
  };

  it("creates a lead with valid data", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);
    mockSupabaseAdmin.single.mockResolvedValue({
      data: { id: "lead-uuid-1", ...validPayload },
      error: null,
    });

    const req = buildRequest("/api/intake", {
      method: "POST",
      body: JSON.stringify(validPayload),
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.lead_id).toBeDefined();
  });

  it("rejects submission with missing required fields", async () => {
    const req = buildRequest("/api/intake", {
      method: "POST",
      body: JSON.stringify({ first_name: "John" }),
    });
    const res = await POST(req);

    expect(res.status).toBeGreaterThanOrEqual(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("validates email format", async () => {
    const req = buildRequest("/api/intake", {
      method: "POST",
      body: JSON.stringify({ ...validPayload, email: "not-an-email" }),
    });
    const res = await POST(req);

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("validates phone format (XXX) XXX-XXXX", async () => {
    const req = buildRequest("/api/intake", {
      method: "POST",
      body: JSON.stringify({ ...validPayload, phone: "1234567890" }),
    });
    const res = await POST(req);

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("creates co-purchaser leads linked via parent_lead_id", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);
    mockSupabaseAdmin.single.mockResolvedValue({
      data: { id: "lead-uuid-1" },
      error: null,
    });

    const payload = {
      ...validPayload,
      co_persons: [
        { first_name: "Jane", last_name: "Doe", email: "jane@example.com", phone: "(416) 555-5678" },
      ],
    };

    const req = buildRequest("/api/intake", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.co_person_leads_created).toBeGreaterThanOrEqual(1);
  });

  it("sets address_match_flag when co-purchaser address matches existing lead", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);
    // Simulate an existing lead with the same address
    mockSupabaseAdmin.maybeSingle.mockResolvedValue({
      data: { id: "existing-lead", address_street: "123 Main St" },
      error: null,
    });
    mockSupabaseAdmin.single.mockResolvedValue({
      data: { id: "lead-uuid-1" },
      error: null,
    });

    const req = buildRequest("/api/intake", {
      method: "POST",
      body: JSON.stringify(validPayload),
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.address_match).toBe(true);
  });

  it("prevents duplicate submissions for same property address per client", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);
    mockSupabaseAdmin.single.mockResolvedValue({
      data: { id: "existing-lead", address_street: "123 Main St", client_id: mockClient.id },
      error: null,
    });

    const req = buildRequest("/api/intake", {
      method: "POST",
      body: JSON.stringify(validPayload),
    });
    const res = await POST(req);

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("handles corporate entities with is_corporate, corporate_name, inc_number", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);
    mockSupabaseAdmin.single.mockResolvedValue({
      data: { id: "lead-uuid-1", is_corporate: true },
      error: null,
    });

    const payload = {
      ...validPayload,
      is_corporate: true,
      corporate_name: "Acme Corp",
      inc_number: "INC-12345",
    };

    const req = buildRequest("/api/intake", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
  });
});
```

```ts
// __tests__/api/intake/mark-aps-uploaded.test.ts
import { POST } from "@/app/api/intake/mark-aps-uploaded/route";
import { mockSupabaseAdmin, buildRequest } from "../helpers/mocks";

describe("POST /api/intake/mark-aps-uploaded", () => {
  it("marks APS as uploaded on the lead", async () => {
    mockSupabaseAdmin.eq.mockReturnThis();
    mockSupabaseAdmin.update.mockReturnThis();

    const req = buildRequest("/api/intake/mark-aps-uploaded", {
      method: "POST",
      body: JSON.stringify({ lead_id: "lead-uuid-1" }),
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(mockSupabaseAdmin.update).toHaveBeenCalled();
  });

  it("completes associated APS intake task", async () => {
    mockSupabaseAdmin.single.mockResolvedValue({
      data: { id: "task-uuid-1", status: "Pending" },
      error: null,
    });

    const req = buildRequest("/api/intake/mark-aps-uploaded", {
      method: "POST",
      body: JSON.stringify({ lead_id: "lead-uuid-1" }),
    });
    await POST(req);

    expect(mockSupabaseAdmin.update).toHaveBeenCalled();
  });
});
```

### Deals API

```ts
// __tests__/api/deals/deals.test.ts
import { GET } from "@/app/api/deals/route";
import { mockGetAuthClient, mockSupabaseAdmin, mockClient, buildRequest } from "../helpers/mocks";

describe("GET /api/deals", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns only deals belonging to authenticated client", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);
    mockSupabaseAdmin.order.mockResolvedValue({
      data: [
        { id: "deal-1", client_id: mockClient.id, lead_id: "lead-1", type: "Buy", status: "Active" },
      ],
      error: null,
    });
    mockSupabaseAdmin.in.mockResolvedValue({
      data: [{ id: "lead-1", first_name: "John", address_street: "123 Main St" }],
      error: null,
    });

    const req = buildRequest("/api/deals");
    const res = await GET(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.deals).toHaveLength(1);
    expect(json.deals[0].id).toBe("deal-1");
  });

  it("enriches deals with address and contact data from leads", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);
    mockSupabaseAdmin.order.mockResolvedValue({
      data: [{ id: "deal-1", client_id: mockClient.id, lead_id: "lead-1" }],
      error: null,
    });
    mockSupabaseAdmin.in.mockResolvedValue({
      data: [{
        id: "lead-1",
        first_name: "John",
        last_name: "Doe",
        address_street: "123 Main St",
        address_city: "Toronto",
      }],
      error: null,
    });

    const req = buildRequest("/api/deals");
    const res = await GET(req);
    const json = await res.json();

    expect(json.deals[0].address_street).toBe("123 Main St");
    expect(json.deals[0].first_name).toBe("John");
  });

  it("returns 401 for unauthenticated requests", async () => {
    mockGetAuthClient.mockResolvedValue(null);

    const req = buildRequest("/api/deals");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });
});
```

### Milestones API

```ts
// __tests__/api/milestones/milestones.test.ts
import { GET } from "@/app/api/milestones/route";
import { mockGetAuthClient, mockSupabaseAdmin, mockClient, buildRequest } from "../helpers/mocks";

describe("GET /api/milestones", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns milestones for a given deal", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);
    mockSupabaseAdmin.order.mockResolvedValue({
      data: [
        { id: "ms-1", deal_id: "deal-1", label: "Intake", status: "Completed", order_index: 1 },
        { id: "ms-2", deal_id: "deal-1", label: "Title Search", status: "In Progress", order_index: 2 },
      ],
      error: null,
    });

    const req = buildRequest("/api/milestones?deal_id=deal-1");
    const res = await GET(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.milestones).toHaveLength(2);
  });

  it("milestones are ordered by order_index", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);
    mockSupabaseAdmin.order.mockResolvedValue({
      data: [
        { id: "ms-1", label: "Intake", order_index: 1 },
        { id: "ms-2", label: "Title Search", order_index: 2 },
        { id: "ms-3", label: "Closing", order_index: 3 },
      ],
      error: null,
    });

    const req = buildRequest("/api/milestones?deal_id=deal-1");
    const res = await GET(req);
    const json = await res.json();

    const indexes = json.milestones.map((m: any) => m.order_index);
    expect(indexes).toEqual([1, 2, 3]);
  });

  it("includes progress/status for each milestone", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);
    mockSupabaseAdmin.order.mockResolvedValue({
      data: [
        { id: "ms-1", label: "Intake", status: "Completed", order_index: 1 },
      ],
      error: null,
    });

    const req = buildRequest("/api/milestones?deal_id=deal-1");
    const res = await GET(req);
    const json = await res.json();

    expect(json.milestones[0].status).toBe("Completed");
  });
});
```

### Tasks API

```ts
// __tests__/api/tasks/tasks.test.ts
import { GET } from "@/app/api/tasks/route";
import { mockGetAuthClient, mockSupabaseAdmin, mockClient, buildRequest } from "../helpers/mocks";

describe("GET /api/tasks", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns tasks for all deals of authenticated client", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);
    mockSupabaseAdmin.order.mockResolvedValue({
      data: [
        { id: "task-1", deal_id: "deal-1", title: "Upload ID", status: "Pending", is_shared: false },
        { id: "task-2", deal_id: "deal-1", title: "Sign Agreement", status: "Completed", is_shared: true },
      ],
      error: null,
    });

    const req = buildRequest("/api/tasks?deal_id=deal-1");
    const res = await GET(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.tasks.length).toBeGreaterThanOrEqual(1);
  });

  it("co-purchasers only see shared tasks (is_shared = true)", async () => {
    // Simulate co-purchaser client (has parent_lead_id)
    mockGetAuthClient.mockResolvedValue({ ...mockClient, id: "co-purchaser-client" });
    mockSupabaseAdmin.order.mockResolvedValue({
      data: [
        { id: "task-2", deal_id: "deal-1", title: "Sign Agreement", status: "Pending", is_shared: true },
      ],
      error: null,
    });

    const req = buildRequest("/api/tasks?deal_id=deal-1");
    const res = await GET(req);
    const json = await res.json();

    json.tasks.forEach((task: any) => {
      expect(task.is_shared).toBe(true);
    });
  });
});
```

```ts
// __tests__/api/tasks/task-by-id.test.ts
import { GET } from "@/app/api/tasks/[id]/route";
import { mockGetAuthClient, mockSupabaseAdmin, mockClient, buildRequest } from "../helpers/mocks";

describe("GET /api/tasks/[id]", () => {
  it("returns specific task by ID", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);
    mockSupabaseAdmin.single.mockResolvedValue({
      data: { id: "task-1", title: "Upload ID", status: "Pending" },
      error: null,
    });

    const req = buildRequest("/api/tasks/task-1");
    const res = await GET(req, { params: { id: "task-1" } });
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.task.id).toBe("task-1");
  });

  it("returns 404 for non-existent task", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);
    mockSupabaseAdmin.single.mockResolvedValue({
      data: null,
      error: { message: "Row not found" },
    });

    const req = buildRequest("/api/tasks/nonexistent");
    const res = await GET(req, { params: { id: "nonexistent" } });

    expect(res.status).toBe(404);
  });
});
```

```ts
// __tests__/api/tasks/task-form-fields.test.ts
import { GET } from "@/app/api/task-form-fields/route";
import { mockSupabaseAdmin, buildRequest } from "../helpers/mocks";

describe("GET /api/task-form-fields", () => {
  it("returns dynamic form fields for a task template", async () => {
    mockSupabaseAdmin.order.mockResolvedValue({
      data: [
        { id: "field-1", field_type: "text", label: "Full Name", required: true, order_index: 1 },
        { id: "field-2", field_type: "email", label: "Email", required: true, order_index: 2 },
        { id: "field-3", field_type: "file", label: "Upload Document", required: false, order_index: 3 },
      ],
      error: null,
    });

    const req = buildRequest("/api/task-form-fields?task_template_id=tpl-1");
    const res = await GET(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.fields).toHaveLength(3);
    expect(json.fields[0].field_type).toBe("text");
  });
});
```

### Task Responses API

```ts
// __tests__/api/task-responses/task-responses.test.ts
import { POST, GET } from "@/app/api/task-responses/route";
import { mockGetAuthClient, mockSupabaseAdmin, mockClient, buildRequest } from "../helpers/mocks";

jest.mock("@/lib/syncSharedTask", () => ({ syncSharedTask: jest.fn() }));
jest.mock("@/lib/triggerMilestoneEmail", () => ({ triggerMilestoneEmail: jest.fn() }));

describe("POST /api/task-responses", () => {
  beforeEach(() => jest.clearAllMocks());

  it("saves text response to a task", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);
    mockSupabaseAdmin.single.mockResolvedValue({
      data: { id: "task-1", deal_id: "deal-1", milestone_id: "ms-1" },
      error: null,
    });
    mockSupabaseAdmin.insert.mockReturnThis();
    mockSupabaseAdmin.select.mockResolvedValue({ data: [{ id: "resp-1" }], error: null });

    const req = buildRequest("/api/task-responses", {
      method: "POST",
      body: JSON.stringify({
        task_id: "task-1",
        responses: [{ field_label: "Full Name", response: "John Doe" }],
      }),
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
  });

  it("saves file upload response with file_url and file_name", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);
    mockSupabaseAdmin.single.mockResolvedValue({
      data: { id: "task-1", deal_id: "deal-1", milestone_id: "ms-1" },
      error: null,
    });
    mockSupabaseAdmin.insert.mockReturnThis();
    mockSupabaseAdmin.select.mockResolvedValue({ data: [{ id: "resp-1" }], error: null });

    const req = buildRequest("/api/task-responses", {
      method: "POST",
      body: JSON.stringify({
        task_id: "task-1",
        responses: [{
          field_label: "Document",
          response: "",
          file_url: "https://blob.vercel-storage.com/doc.pdf",
          file_name: "doc.pdf",
        }],
      }),
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
  });

  it("rejects response for task not owned by client", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);
    mockSupabaseAdmin.single.mockResolvedValue({
      data: null,
      error: { message: "Not found" },
    });

    const req = buildRequest("/api/task-responses", {
      method: "POST",
      body: JSON.stringify({
        task_id: "other-clients-task",
        responses: [{ field_label: "Name", response: "John" }],
      }),
    });
    const res = await POST(req);

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("GET /api/task-responses", () => {
  it("fetches responses by task_id", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);
    mockSupabaseAdmin.order.mockResolvedValue({
      data: [
        { id: "resp-1", task_id: "task-1", response: "John Doe", file_url: null },
      ],
      error: null,
    });

    const req = buildRequest("/api/task-responses?task_id=task-1");
    const res = await GET(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.responses).toHaveLength(1);
  });
});
```

### Retainer API

```ts
// __tests__/api/retainer/retainer.test.ts
import { GET } from "@/app/api/retainer/check/route";
import { POST } from "@/app/api/retainer/sign/route";
import { mockGetAuthClient, mockSupabaseAdmin, mockClient, buildRequest } from "../helpers/mocks";

describe("GET /api/retainer/check", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns true if client has signed retainer", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);
    mockSupabaseAdmin.maybeSingle.mockResolvedValue({
      data: { id: "sig-1", signed_date: "2026-01-15", signature: "John Doe" },
      error: null,
    });

    const req = buildRequest("/api/retainer/check");
    const res = await GET(req);
    const json = await res.json();

    expect(json.signed).toBe(true);
  });

  it("returns false if retainer is unsigned", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);
    mockSupabaseAdmin.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const req = buildRequest("/api/retainer/check");
    const res = await GET(req);
    const json = await res.json();

    expect(json.signed).toBe(false);
  });
});

describe("POST /api/retainer/sign", () => {
  it("creates retainer signature record", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);
    mockSupabaseAdmin.single.mockResolvedValue({
      data: { id: "lead-1", first_name: "John", last_name: "Doe" },
      error: null,
    });
    mockSupabaseAdmin.insert.mockReturnThis();
    mockSupabaseAdmin.select.mockResolvedValue({
      data: { id: "sig-1" },
      error: null,
    });

    const req = buildRequest("/api/retainer/sign", {
      method: "POST",
      body: JSON.stringify({ signature: "John Doe", lead_id: "lead-1" }),
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
  });

  it("rejects if signature data is missing", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);

    const req = buildRequest("/api/retainer/sign", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
```

### Document Upload

```ts
// __tests__/api/upload/uploadblobstorage.test.ts
import { POST } from "@/app/api/uploadblobstorage/route";
import { mockSupabaseAdmin, buildRequest } from "../helpers/mocks";

jest.mock("@vercel/blob", () => ({
  put: jest.fn().mockResolvedValue({
    url: "https://blob.vercel-storage.com/corporate-docs/lead-1/1234-doc.pdf",
  }),
}));

describe("POST /api/uploadblobstorage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("uploads file to Vercel Blob and returns URL", async () => {
    mockSupabaseAdmin.insert.mockReturnThis();
    mockSupabaseAdmin.select.mockResolvedValue({
      data: { id: "doc-1" },
      error: null,
    });

    const formData = new FormData();
    formData.append("file", new Blob(["pdf content"], { type: "application/pdf" }), "doc.pdf");
    formData.append("lead_id", "lead-1");
    formData.append("doc_type", "APS");

    const req = new Request("http://localhost:3000/api/uploadblobstorage", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
  });

  it("stores file under correct path corporate-docs/{lead_id}/{timestamp}-{filename}", async () => {
    const { put } = require("@vercel/blob");
    mockSupabaseAdmin.insert.mockReturnThis();
    mockSupabaseAdmin.select.mockResolvedValue({ data: { id: "doc-1" }, error: null });

    const formData = new FormData();
    formData.append("file", new Blob(["content"], { type: "application/pdf" }), "agreement.pdf");
    formData.append("lead_id", "lead-1");
    formData.append("doc_type", "APS");

    const req = new Request("http://localhost:3000/api/uploadblobstorage", {
      method: "POST",
      body: formData,
    });
    await POST(req);

    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^corporate-docs\/lead-1\/\d+-agreement\.pdf$/),
      expect.anything(),
      expect.anything()
    );
  });

  it("rejects files exceeding size limit", async () => {
    const largeContent = new Uint8Array(50 * 1024 * 1024); // 50MB
    const formData = new FormData();
    formData.append("file", new Blob([largeContent]), "large.pdf");
    formData.append("lead_id", "lead-1");
    formData.append("doc_type", "APS");

    const req = new Request("http://localhost:3000/api/uploadblobstorage", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req);

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects disallowed file types", async () => {
    const formData = new FormData();
    formData.append("file", new Blob(["malicious"], { type: "application/x-executable" }), "malware.exe");
    formData.append("lead_id", "lead-1");
    formData.append("doc_type", "APS");

    const req = new Request("http://localhost:3000/api/uploadblobstorage", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req);

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
```

### Admin API

```ts
// __tests__/api/admin/admin.test.ts
import { GET } from "@/app/api/admin/leads/route";
import { POST as convertLead } from "@/app/api/admin/convert-lead/route";
import { POST as linkCoPurchaser } from "@/app/api/admin/link-co-purchaser/route";
import { mockSupabaseAdmin, buildRequest } from "../helpers/mocks";

jest.mock("@/lib/convertLead", () => ({ convertLead: jest.fn() }));

describe("GET /api/admin/leads", () => {
  it("returns all leads", async () => {
    mockSupabaseAdmin.order.mockResolvedValue({
      data: [
        { id: "lead-1", first_name: "John", status: "new" },
        { id: "lead-2", first_name: "Jane", status: "converted" },
      ],
      error: null,
    });

    const req = buildRequest("/api/admin/leads");
    const res = await GET(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.leads).toHaveLength(2);
  });
});

describe("POST /api/admin/convert-lead", () => {
  it("converts lead to deal", async () => {
    const { convertLead: mockConvert } = require("@/lib/convertLead");
    mockConvert.mockResolvedValue({ deal_id: "deal-1" });

    const req = buildRequest("/api/admin/convert-lead", {
      method: "POST",
      body: JSON.stringify({ lead_id: "lead-1" }),
    });
    const res = await convertLead(req);
    const json = await res.json();

    expect(json.success).toBe(true);
  });

  it("creates milestones and tasks from templates", async () => {
    const { convertLead: mockConvert } = require("@/lib/convertLead");
    mockConvert.mockResolvedValue({ deal_id: "deal-1", milestones_created: 5, tasks_created: 12 });

    const req = buildRequest("/api/admin/convert-lead", {
      method: "POST",
      body: JSON.stringify({ lead_id: "lead-1" }),
    });
    const res = await convertLead(req);
    const json = await res.json();

    expect(json.milestones_created).toBeGreaterThan(0);
    expect(json.tasks_created).toBeGreaterThan(0);
  });

  it("sends invite email to client", async () => {
    const { convertLead: mockConvert } = require("@/lib/convertLead");
    mockConvert.mockResolvedValue({ deal_id: "deal-1", invite_sent: true });

    const req = buildRequest("/api/admin/convert-lead", {
      method: "POST",
      body: JSON.stringify({ lead_id: "lead-1" }),
    });
    const res = await convertLead(req);
    const json = await res.json();

    expect(json.invite_sent).toBe(true);
  });
});

describe("POST /api/admin/link-co-purchaser", () => {
  it("links co-purchaser lead to parent lead", async () => {
    mockSupabaseAdmin.update.mockReturnThis();
    mockSupabaseAdmin.eq.mockResolvedValue({ data: null, error: null });

    const req = buildRequest("/api/admin/link-co-purchaser", {
      method: "POST",
      body: JSON.stringify({ lead_id: "co-lead-1", parent_lead_id: "lead-1" }),
    });
    const res = await linkCoPurchaser(req);
    const json = await res.json();

    expect(json.success).toBe(true);
  });
});
```

### Link Leads API

```ts
// __tests__/api/link-leads/link-leads.test.ts
import { POST } from "@/app/api/link-leads/route";
import { mockGetAuthClient, mockSupabaseAdmin, mockClient, buildRequest } from "../helpers/mocks";

describe("POST /api/link-leads", () => {
  it("links unlinked leads to authenticated client account", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);
    mockSupabaseAdmin.eq.mockReturnThis();
    mockSupabaseAdmin.is.mockResolvedValue({
      data: [{ id: "lead-orphan", email: "john@example.com", client_id: null }],
      error: null,
    });
    mockSupabaseAdmin.update.mockReturnThis();

    const req = buildRequest("/api/link-leads", { method: "POST" });
    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
  });
});
```

### Dashboard Property API

```ts
// __tests__/api/dashboard/dashboardproperty.test.ts
import { GET } from "@/app/api/dashboardproperty/route";
import { mockGetAuthClient, mockSupabaseAdmin, mockClient, buildRequest } from "../helpers/mocks";

describe("GET /api/dashboardproperty", () => {
  it("returns property-specific dashboard data for authenticated client", async () => {
    mockGetAuthClient.mockResolvedValue(mockClient);
    mockSupabaseAdmin.single.mockResolvedValue({
      data: {
        id: "deal-1",
        property_address: "123 Main St, Toronto",
        closing_date: "2026-06-15",
        status: "Active",
      },
      error: null,
    });

    const req = buildRequest("/api/dashboardproperty");
    const res = await GET(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.property_address).toBeDefined();
  });
});
```

### Helper / Utility Functions

```ts
// __tests__/lib/getAuthClient.test.ts
import { getAuthClient } from "@/lib/getAuthClient";
import { mockSupabaseAdmin } from "../helpers/mocks";

jest.mock("@/lib/getAuthUser", () => ({
  getAuthUser: jest.fn(),
}));

describe("getAuthClient()", () => {
  const { getAuthUser } = require("@/lib/getAuthUser");

  beforeEach(() => jest.clearAllMocks());

  it("resolves client from auth_user_id", async () => {
    getAuthUser.mockResolvedValue({ id: "auth-uuid-1", email: "john@example.com" });
    mockSupabaseAdmin.maybeSingle.mockResolvedValue({
      data: { id: "client-1", auth_user_id: "auth-uuid-1" },
      error: null,
    });

    const client = await getAuthClient();

    expect(client).not.toBeNull();
    expect(client.id).toBe("client-1");
  });

  it("falls back to email match when auth_user_id lookup fails", async () => {
    getAuthUser.mockResolvedValue({ id: "auth-uuid-1", email: "john@example.com" });
    // First call (auth_user_id) returns null
    mockSupabaseAdmin.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      // Second call (email) returns client
      .mockResolvedValueOnce({ data: { id: "client-1", email: "john@example.com" }, error: null });

    const client = await getAuthClient();

    expect(client).not.toBeNull();
    expect(client.email).toBe("john@example.com");
  });

  it("falls back to leads table when email match fails", async () => {
    getAuthUser.mockResolvedValue({ id: "auth-uuid-1", email: "john@example.com" });
    // auth_user_id and email both return null
    mockSupabaseAdmin.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    // Lead lookup returns a match
    mockSupabaseAdmin.single.mockResolvedValue({
      data: { id: "lead-1", email: "john@example.com" },
      error: null,
    });
    // Client insert
    mockSupabaseAdmin.insert.mockReturnThis();
    mockSupabaseAdmin.select.mockResolvedValue({
      data: { id: "new-client-1" },
      error: null,
    });

    const client = await getAuthClient();

    expect(client).not.toBeNull();
  });

  it("returns null when not authenticated", async () => {
    getAuthUser.mockResolvedValue(null);

    const client = await getAuthClient();

    expect(client).toBeNull();
  });
});
```

```ts
// __tests__/lib/utils.test.ts

describe("Phone formatter", () => {
  // Regex used in intake components
  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  it("outputs (XXX) XXX-XXXX for valid 10-digit input", () => {
    expect(formatPhone("4165551234")).toBe("(416) 555-1234");
  });

  it("handles partial input gracefully", () => {
    expect(formatPhone("416")).toBe("(416");
    expect(formatPhone("416555")).toBe("(416) 555");
  });

  it("strips non-digit characters", () => {
    expect(formatPhone("(416) 555-1234")).toBe("(416) 555-1234");
  });
});

describe("Email validation", () => {
  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  it("accepts valid email addresses", () => {
    expect(isValidEmail("john@example.com")).toBe(true);
    expect(isValidEmail("jane.doe@company.co")).toBe(true);
  });

  it("rejects invalid email formats", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
    expect(isValidEmail("john@")).toBe(false);
    expect(isValidEmail("john @example.com")).toBe(false);
  });
});

describe("Address autocomplete parser", () => {
  const parseAddress = (place: { address_components: Array<{ types: string[]; long_name: string; short_name: string }> }) => {
    const get = (type: string) =>
      place.address_components.find((c) => c.types.includes(type));

    return {
      street: `${get("street_number")?.long_name || ""} ${get("route")?.long_name || ""}`.trim(),
      city: get("locality")?.long_name || "",
      province: get("administrative_area_level_1")?.short_name || "",
      postal_code: get("postal_code")?.long_name || "",
    };
  };

  it("extracts street, city, province, postal code correctly", () => {
    const place = {
      address_components: [
        { types: ["street_number"], long_name: "123", short_name: "123" },
        { types: ["route"], long_name: "Main Street", short_name: "Main St" },
        { types: ["locality"], long_name: "Toronto", short_name: "Toronto" },
        { types: ["administrative_area_level_1"], long_name: "Ontario", short_name: "ON" },
        { types: ["postal_code"], long_name: "M5V 1A1", short_name: "M5V 1A1" },
      ],
    };

    const result = parseAddress(place);

    expect(result.street).toBe("123 Main Street");
    expect(result.city).toBe("Toronto");
    expect(result.province).toBe("ON");
    expect(result.postal_code).toBe("M5V 1A1");
  });
});
```

---

## BDD (Behavior-Driven Tests)

### Feature: User Registration & Login

```gherkin
Feature: User Registration & Login

  Scenario: New customer logs in for the first time
    Given a lead has been converted and an invite email sent
    When the customer clicks the invite link
    And sets a password on the /set-password page
    Then their account is created
    And they are redirected to the dashboard

  Scenario: Returning customer logs in
    Given the customer has an existing account
    When they enter valid credentials on /login
    Then they are authenticated and redirected to the dashboard

  Scenario: Customer enters wrong password
    Given the customer has an existing account
    When they enter an incorrect password
    Then they see an error message and remain on the login page

  Scenario: Customer resets password
    Given the customer has forgotten their password
    When they submit their email on /forgot-password
    Then they receive a password reset email
    And they are redirected to /reset-link-sent
```

### Feature: Intake Form Submission

```gherkin
Feature: Intake Form Submission

  Scenario: Customer submits a property closing intake
    Given the customer is on the /intake page
    When they select "Property Closing" and "Buy"
    And enter the purchase price and property address
    And confirm the APS is signed and upload the document
    And fill in contact information
    And click submit
    Then a new lead is created with status "new"
    And the uploaded APS file is stored in Vercel Blob
    And they see a confirmation screen

  Scenario: Customer adds a co-purchaser
    Given the customer is on Step 5 of the intake form
    When they click "Add Co-Purchaser"
    And enter the co-purchaser's name, email, and phone
    Then a separate co-purchaser lead is created with parent_lead_id set

  Scenario: Customer submits intake without required fields
    Given the customer is on the intake form
    When they try to proceed without filling required fields
    Then they see validation errors and cannot advance to the next step

  Scenario: Customer submits a mortgage refinance intake
    Given the customer is on the /intake page
    When they select "Mortgage Refinance"
    And complete all required steps
    Then a lead with type "refinance" is created

  Scenario: Customer submits for same property address twice
    Given the customer already submitted an intake for 123 Main St
    When they try to submit another intake for 123 Main St
    Then the submission is rejected with a duplicate address error
```

### Feature: Retainer Agreement

```gherkin
Feature: Retainer Agreement

  Scenario: Customer must sign retainer before accessing dashboard
    Given the customer is logged in
    And they have not signed the retainer agreement
    When they try to access /dashboard
    Then they are redirected to /retainer

  Scenario: Customer signs retainer agreement
    Given the customer is on the /retainer page
    When they enter their full name
    And accept the agreement checkbox
    And click submit
    Then the retainer signature is recorded
    And they are redirected to the dashboard

  Scenario: Customer has already signed retainer
    Given the customer has previously signed the retainer
    When they navigate to /dashboard
    Then they see the dashboard without being redirected
```

### Feature: Dashboard & Deal Tracking

```gherkin
Feature: Dashboard & Deal Tracking

  Scenario: Customer views their deals on the dashboard
    Given the customer is logged in and has signed the retainer
    When they navigate to /dashboard
    Then they see a list of their active deals
    And each deal shows its current milestone and status

  Scenario: Customer views milestones for a deal
    Given the customer has an active deal
    When they view the deal on the dashboard
    Then they see milestones in order (e.g., Intake, Title Search, Closing)
    And completed milestones are visually distinguished from pending ones

  Scenario: Co-purchaser views limited tasks
    Given a co-purchaser is logged in
    When they view their deal tasks
    Then they only see tasks marked as shared
    And they do not see tasks exclusive to the primary purchaser
```

### Feature: Task Management

```gherkin
Feature: Task Management

  Scenario: Customer completes a text-based task
    Given the customer has an open task with a text input field
    When they open the task drawer
    And fill in the required text fields
    And click submit
    Then the task response is saved
    And the task status updates to complete

  Scenario: Customer uploads a document for a task
    Given the customer has a task requiring a file upload
    When they open the task drawer
    And upload a PDF document
    And click submit
    Then the file is stored in Vercel Blob
    And the task response records the file URL and name

  Scenario: Customer schedules an appointment via task
    Given the customer has a "Schedule Appointment" task
    When they open the task drawer
    And book a time via the embedded Calendly widget
    Then the task is marked as complete

  Scenario: Customer views dynamic form fields for a task
    Given a task has associated form fields (text, select, checkbox, date, file)
    When the customer opens the task drawer
    Then they see the correct input types rendered for each field
    And required fields are enforced on submission
```

### Feature: Document Management

```gherkin
Feature: Document Management

  Scenario: Customer views uploaded documents
    Given the customer has uploaded documents during intake and tasks
    When they navigate to /documents
    Then they see a list of all their uploaded documents with names and dates

  Scenario: Customer uploads identification documents
    Given the customer is on the dashboard
    When they open the Upload Identification drawer
    And upload front and back images of their government ID
    Then the files are stored and linked to their lead

  Scenario: Customer uploads home insurance
    Given the customer has a home insurance upload task
    When they upload an insurance document
    Then the document is stored and the task is completed
```

### Feature: Personal Information

```gherkin
Feature: Personal Information

  Scenario: Customer updates their personal details
    Given the customer is on the /details page
    When they edit their first name, last name, or phone number
    And click save
    Then the updated information is persisted

  Scenario: Customer views pre-filled personal information
    Given the customer is logged in
    When they navigate to /details
    Then their current name, email, and phone are pre-filled
```

### Feature: Navigation & Layout

```gherkin
Feature: Navigation & Layout

  Scenario: Unauthenticated user tries to access protected page
    Given the user is not logged in
    When they navigate to /dashboard
    Then they are redirected to /login

  Scenario: Mobile user navigates the application
    Given the user is on a mobile device
    When they tap the hamburger menu icon
    Then the mobile navigation menu opens
    And they can navigate to all main sections

  Scenario: Customer logs out
    Given the customer is logged in
    When they click the logout option in the profile dropdown
    Then their session is cleared
    And they are redirected to /login
```

### Feature: Admin Lead Management

```gherkin
Feature: Admin Lead Management

  Scenario: Admin converts a lead to a deal
    Given a lead exists with status "new"
    When the admin triggers lead conversion
    Then a deal is created linked to the lead
    And milestones are generated from stage templates
    And tasks are generated from task templates
    And an invite email is sent to the customer

  Scenario: Admin links a co-purchaser
    Given a co-purchaser lead exists without a parent link
    When the admin links it to a parent lead
    Then the co-purchaser's parent_lead_id is set
    And they gain access to shared tasks on the parent's deal
```

### Feature: Email Notifications

```gherkin
Feature: Email Notifications

  Scenario: Welcome email is sent on lead creation
    Given a new lead is submitted via the intake form
    When the lead is saved
    Then a welcome email is sent via Resend to the lead's email

  Scenario: Invite email is sent on lead conversion
    Given an admin converts a lead to a deal
    When the deal is created
    Then an invite email with a magic link is sent to the customer

  Scenario: Email fails gracefully
    Given the Resend email service is unavailable
    When an email send is attempted
    Then the error is logged
    And the user-facing operation still completes without crashing
```

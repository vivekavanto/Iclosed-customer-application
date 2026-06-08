import type { ReactElement } from "react";
import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import "@testing-library/jest-dom/jest-globals";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PersonalInformationDrawer from "./PersonalInformationDrawer";
import { ToastProvider } from "@/components/ui/Toast";

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn(() => {});
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
});

function renderDrawer(ui: ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

function setupFetchMocks(options?: { saveOk?: boolean }) {
  const saveOk = options?.saveOk ?? true;
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/task-form-fields")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, fields: [] }),
      } as Response);
    }
    if (url.includes("/api/client-personal-info")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, personalInfo: null }),
      } as Response);
    }
    if (url.includes("/api/task-responses")) {
      return Promise.resolve({
        ok: saveOk,
        json: () => Promise.resolve({}),
      } as Response);
    }
    return Promise.reject(new Error(`Unmocked fetch: ${url}`));
  });
}

function drawerScope() {
  const dialog = screen.getByRole("dialog", { name: /personal information/i });
  return within(dialog);
}

/** Lets the task-form-fields `useEffect` fetch settle so updates are not mid-interaction. */
async function flushFieldDefinitionsFetch() {
  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/task-form-fields"),
    );
  });
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  const w = drawerScope();
  // /^phone number/i avoids matching "Business/Employer Phone Number"
  await user.type(w.getByRole("textbox", { name: /^phone number/i }), "4165551234");
  await user.type(w.getByRole("textbox", { name: /street address/i }), "10 Example St");
  await user.type(w.getByRole("textbox", { name: /^city/i }), "Toronto");
  await user.type(w.getByRole("textbox", { name: /postal code/i }), "M1B3C6");

  await user.selectOptions(w.getByLabelText(/marital status/i), "single");
  await user.selectOptions(
    w.getByLabelText(/primary residence or an investment property/i),
    "primary",
  );
  await user.selectOptions(w.getByLabelText(/ever owned a property/i), "no");
  await user.selectOptions(w.getByLabelText(/citizenship status/i), "canadian_citizen");
  await user.selectOptions(w.getByLabelText(/365 days.*lived outside/i), "no");
  await user.type(w.getByRole("textbox", { name: /occupation/i }), "Engineer");
  await user.type(w.getByRole("textbox", { name: /source of funds/i }), "Savings from employment");
  await user.selectOptions(w.getByLabelText(/virtually or in person/i), "in_person");
}

describe("PersonalInformationDrawer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.style.overflow = "";
  });

  it("renders the dialog when open", async () => {
    setupFetchMocks();
    renderDrawer(
      <PersonalInformationDrawer open onClose={jest.fn()} taskId="task-1" />,
    );
    await flushFieldDefinitionsFetch();
    expect(screen.getByRole("dialog", { name: /personal information/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /personal information/i })).toBeInTheDocument();
  });

  it("calls onClose when the close button is pressed", async () => {
    setupFetchMocks();
    const user = userEvent.setup();
    const onClose = jest.fn();
    renderDrawer(<PersonalInformationDrawer open onClose={onClose} taskId="task-1" />);
    await flushFieldDefinitionsFetch();

    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows validation errors when Save & Continue is clicked with an empty form", async () => {
    setupFetchMocks();
    const user = userEvent.setup();
    renderDrawer(<PersonalInformationDrawer open onClose={jest.fn()} taskId="task-1" />);
    await flushFieldDefinitionsFetch();

    await user.click(screen.getByRole("button", { name: /save & continue/i }));

    expect(await screen.findByText(/phone number is required/i)).toBeInTheDocument();
    expect(screen.getByText(/street address is required/i)).toBeInTheDocument();
  });

  it("prefills phone from property but leaves address fields blank when opened", async () => {
    setupFetchMocks();
    const { rerender } = renderDrawer(
      <PersonalInformationDrawer
        open={false}
        onClose={jest.fn()}
        taskId="task-1"
        property={{
          phone: "(647) 111-2222",
          address_street: "99 Prefill Rd",
          address_city: "Ottawa",
          address_postal_code: "K1A0A6",
        }}
      />,
    );

    rerender(
      <ToastProvider>
        <PersonalInformationDrawer
          open
          onClose={jest.fn()}
          taskId="task-1"
          property={{
            phone: "(647) 111-2222",
            address_street: "99 Prefill Rd",
            address_city: "Ottawa",
            address_postal_code: "K1A0A6",
          }}
        />
      </ToastProvider>,
    );

    await flushFieldDefinitionsFetch();
    const w = drawerScope();
    await waitFor(() => {
      expect(w.getByRole("textbox", { name: /^phone number/i })).toHaveValue("(647) 111-2222");
    });
    // The lead's address is the *property* address from intake, not the
    // customer's current address — it must not auto-populate here.
    expect(w.getByRole("textbox", { name: /^city/i })).toHaveValue("");
    expect(w.getByRole("textbox", { name: /postal code/i })).toHaveValue("");
  });

  it("posts responses and calls onSaved and onClose after a valid save", async () => {
    setupFetchMocks({ saveOk: true });
    const user = userEvent.setup();
    const onClose = jest.fn();
    const onSaved = jest.fn();

    renderDrawer(
      <PersonalInformationDrawer
        open
        onClose={onClose}
        onSaved={onSaved}
        taskId="task-99"
      />,
    );

    await flushFieldDefinitionsFetch();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /save & continue/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);

    const postCalls = (global.fetch as jest.Mock).mock.calls.filter(
      (c) => typeof c[0] === "string" && (c[0] as string).includes("/api/task-responses"),
    );
    expect(postCalls.length).toBeGreaterThanOrEqual(1);
    const [, init] = postCalls[postCalls.length - 1];
    expect(init).toMatchObject({ method: "POST" });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.task_id).toBe("task-99");
    expect(Array.isArray(body.responses)).toBe(true);
  });
});

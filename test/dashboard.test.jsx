import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DashboardShell from "../app/components/DashboardShell.jsx";
import { LS_SAVED } from "../app/lib/constants.js";

const NOW = new Date(2026, 6, 12, 10, 0, 0);

const projects = [
  { id: "mladezhka", name: "Младежка заетост+", program: "ПРЧР", category: "youth", status: "open", deadline: "20.07.2026", deadline_date: "2026-07-20", budget: "204 516 €", eligible: "младежи до 29 г.", link: "https://az.bg", is_new: 1, last_updated: "2026-07-10", doc_count: 1 },
  { id: "pkip-inovatsii", name: "Внедряване на иновации", program: "ПКИП", category: "other", status: "upcoming", deadline: "есен 2026", deadline_date: "2026-11-01", budget: "83 млн. €", eligible: "МСП", link: "https://pkip.bg", is_new: 0, last_updated: "2026-07-02", doc_count: 0 },
  { id: "obrazovanie", name: "Дигитални умения", program: "Образование", category: "other", status: "closing_soon", deadline: "14.07.2026", deadline_date: "2026-07-14", budget: "12 млн. лв.", eligible: "училища", link: "https://mon.bg", is_new: 0, last_updated: "2026-07-08", doc_count: 0 },
  { id: "okolna-sreda", name: "Зелени технологии", program: "Околна среда", category: "other", status: "open", deadline: "01.09.2026", deadline_date: "2026-09-01", budget: "40 млн. €", eligible: "общини", link: "https://ops.bg", is_new: 0, last_updated: "2026-07-01", doc_count: 0 },
];

const initialData = { projects, snapshot: { run_date: "2026-07-12", summary: "Тестово резюме." }, ok: true };

const loadDetail = vi.fn(async (id) => ({
  project: { ...projects.find((p) => p.id === id), doc_count: 1 },
  documents: [{ id: 1, project_id: id, title: "Условия за кандидатстване", doc_type: "Условия", content: "## Заглавие\n- точка", source_url: "https://source.bg" }],
  ok: true,
}));

function renderShell(extra = {}) {
  return render(<DashboardShell initialData={initialData} loadDetail={loadDetail} now={NOW} {...extra} />);
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  loadDetail.mockClear();
});

async function gotoProcedures(user) {
  await user.click(screen.getByRole("button", { name: /Процедури/ }));
}

describe("DashboardShell — навигация и рендер", () => {
  it("показва KPI картите в Обзор", () => {
    renderShell();
    expect(screen.getByText("Отворени процедури")).toBeInTheDocument();
    expect(screen.getByText("Изтичащи до 30 дни")).toBeInTheDocument();
    // 2 отворени (open) + 1 closing_soon = 3
    const open = screen.getByText("Отворени процедури").closest("button");
    expect(within(open).getByText("3")).toBeInTheDocument();
  });

  it("показва резюмето от snapshot", () => {
    renderShell();
    expect(screen.getByText("Тестово резюме.")).toBeInTheDocument();
  });
});

describe("Търсене и филтри", () => {
  it("българското търсене филтрира резултатите", async () => {
    const user = userEvent.setup();
    renderShell();
    await gotoProcedures(user);
    const search = screen.getByLabelText("Търсене на процедури");
    await user.type(search, "иновации");
    await waitFor(() => {
      expect(screen.getByText("Внедряване на иновации")).toBeInTheDocument();
      expect(screen.queryByText("Младежка заетост+")).not.toBeInTheDocument();
    });
  });

  it("комбиниран филтър + „Изчисти всички“", async () => {
    const user = userEvent.setup();
    renderShell();
    await gotoProcedures(user);
    // Отвори филтър по статус „Отворена“
    const openChk = screen.getByRole("checkbox", { name: /Отворена/ });
    await user.click(openChk);
    await waitFor(() => {
      expect(screen.getByText("Зелени технологии")).toBeInTheDocument();
      expect(screen.queryByText("Дигитални умения")).not.toBeInTheDocument();
    });
    // Изчисти всички (в чиповете)
    const clear = screen.getAllByRole("button", { name: "Изчисти всички" })[0];
    await user.click(clear);
    await waitFor(() => expect(screen.getByText("Дигитални умения")).toBeInTheDocument());
  });

  it("URL се синхронизира при търсене", async () => {
    const user = userEvent.setup();
    renderShell();
    await gotoProcedures(user);
    await user.type(screen.getByLabelText("Търсене на процедури"), "зелени");
    await waitFor(() => expect(window.location.search).toContain("q=") );
  });
});

describe("Запазени — устойчивост в localStorage", () => {
  it("запазването пише в localStorage", async () => {
    const user = userEvent.setup();
    renderShell();
    await gotoProcedures(user);
    const card = screen.getByText("Младежка заетост+").closest("article");
    await user.click(within(card).getByRole("button", { name: /Запази/ }));
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(LS_SAVED) || "[]");
      expect(saved).toContain("mladezhka");
    });
  });
});

describe("Сравнение — лимит 3", () => {
  it("не позволява повече от 3 процедури", async () => {
    const user = userEvent.setup();
    renderShell();
    await gotoProcedures(user);
    const cards = screen.getAllByRole("article");
    for (const c of cards) {
      const btn = within(c).getByRole("button", { name: /сравнение/i });
      await user.click(btn);
    }
    // Трей за сравнение показва максимум 3
    const tray = screen.getByRole("region", { name: "Сравнение" });
    expect(within(tray).getByText("3")).toBeInTheDocument();
  });
});

describe("Детайли drawer — lazy документи и клавиатура", () => {
  it("отваря се, зарежда документи и се затваря с Escape", async () => {
    const user = userEvent.setup();
    renderShell();
    await gotoProcedures(user);
    const card = screen.getByText("Младежка заетост+").closest("article");
    await user.click(within(card).getByRole("button", { name: /Детайли/ }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(loadDetail).toHaveBeenCalledWith("mladezhka", expect.anything());

    // Таб „Документи“ показва мързеливо зареденото заглавие
    await user.click(within(dialog).getByRole("tab", { name: /Документи/ }));
    await waitFor(() =>
      expect(within(dialog).getByText("Условия за кандидатстване")).toBeInTheDocument()
    );

    // Escape затваря
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("Състояния: грешка + повторен опит", () => {
  it("показва грешка и Retry при неуспешно зареждане", async () => {
    const user = userEvent.setup();
    let calls = 0;
    const fetchList = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error("boom");
      return initialData;
    });
    render(<DashboardShell fetchList={fetchList} loadDetail={loadDetail} now={NOW} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Опитай пак/ }));
    await waitFor(() => expect(screen.getByText("Отворени процедури")).toBeInTheDocument());
  });
});

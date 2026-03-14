import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    organization: {
      update: vi.fn(),
    },
    location: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    cashRegister: {
      create: vi.fn(),
    },
    workday: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    workInterval: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
    invitation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    invitationCode: {
      findFirst: vi.fn(),
    },
  }

  return {
    prisma,
    getSessionUserWithOrg: vi.fn(),
    hasOrganizationActionAccess: vi.fn(),
    logAuditEvent: vi.fn(),
    auditActorFromSession: vi.fn(() => ({ user_id: "user_1" })),
    hashAuditIdentifier: vi.fn((value: string) => `hash:${value}`),
    createInviteCode: vi.fn(),
  }
})

vi.mock("@/lib/prisma", () => ({
  prisma: mocked.prisma,
}))

vi.mock("@/lib/auth", () => ({
  getSessionUserWithOrg: mocked.getSessionUserWithOrg,
  hasOrganizationActionAccess: mocked.hasOrganizationActionAccess,
}))

vi.mock("@/lib/observability/audit", () => ({
  logAuditEvent: mocked.logAuditEvent,
  auditActorFromSession: mocked.auditActorFromSession,
  hashAuditIdentifier: mocked.hashAuditIdentifier,
}))

vi.mock("@/lib/invite-codes", () => ({
  createInviteCode: mocked.createInviteCode,
}))

vi.mock("@/lib/pay-components", () => ({
  PAY_COMPONENT_TYPES: ["hourly", "fixed_shift", "percent_revenue"],
  normalizePayComponentsInput: vi.fn((input) => input ?? []),
}))

vi.mock("@/lib/work-interval-conflicts", () => ({
  WORK_INTERVAL_OVERLAP_ERROR_CODE: "WORK_INTERVAL_OVERLAP_ERROR_CODE",
  findOverlappingIntervals: vi.fn(),
  loadIntervalConflictSummariesByIds: vi.fn(),
  recomputeEmployeeConflictStatuses: vi.fn(),
}))

vi.mock("@/lib/work-intervals/status", () => ({
  resolveEffectiveWorkIntervalClosedAt: vi.fn(),
  resolveEffectiveWorkIntervalOpenedAt: vi.fn(),
  resolveEffectiveWorkIntervalStatus: vi.fn(),
}))

vi.mock("@/lib/procedures/config", () => ({
  getDefaultRuleCountsForPosition: vi.fn(),
  isDefaultRulesetConfigured: vi.fn(() => true),
}))

vi.mock("@/lib/notifications/navigation", () => ({
  toNotificationDateOnly: vi.fn(),
}))

import { PUT as PUT_ORGANIZATION } from "../app/api/organizations/route"
import { POST as POST_LOCATION } from "../app/api/locations/route"
import { POST as POST_WORKDAY } from "../app/api/workdays/route"
import { POST as POST_WORKDAY_PUBLISH } from "../app/api/workdays/[id]/publish/route"
import { POST as POST_INTERVAL, PUT as PUT_INTERVAL, DELETE as DELETE_INTERVAL } from "../app/api/intervals/route"
import { GET as GET_INVITATIONS, POST as POST_INVITATIONS, DELETE as DELETE_INVITATIONS } from "../app/api/invitations/route"
import { GET as GET_INVITE_CODES, POST as POST_INVITE_CODES } from "../app/api/invite-codes/route"

describe("security RBAC route guards", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getSessionUserWithOrg.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1" },
      membership: { isActive: true, legacyRole: "worker" },
    })
    mocked.hasOrganizationActionAccess.mockResolvedValue(false)
  })

  it("blocks worker organization and location management routes", async () => {
    const orgResponse = await PUT_ORGANIZATION(
      new Request("http://localhost/api/organizations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated org" }),
      }),
    )
    const locationResponse = await POST_LOCATION(
      new Request("http://localhost/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Main hall" }),
      }),
    )

    expect(orgResponse.status).toBe(403)
    expect(locationResponse.status).toBe(403)
    expect(mocked.prisma.organization.update).not.toHaveBeenCalled()
    expect(mocked.prisma.location.findFirst).not.toHaveBeenCalled()
    expect(mocked.prisma.location.create).not.toHaveBeenCalled()
  })

  it("blocks worker workday and interval mutations before DB side effects", async () => {
    const workdayResponse = await POST_WORKDAY(
      new Request("http://localhost/api/workdays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: "11111111-1111-4111-8111-111111111111",
          workDate: "2026-03-14",
        }),
      }),
    )
    const publishResponse = await POST_WORKDAY_PUBLISH(
      new Request("http://localhost/api/workdays/workday-1/publish", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
    )
    const intervalCreateResponse = await POST_INTERVAL(
      new Request("http://localhost/api/intervals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    )
    const intervalUpdateResponse = await PUT_INTERVAL(
      new Request("http://localhost/api/intervals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    )
    const intervalDeleteResponse = await DELETE_INTERVAL(
      new Request("http://localhost/api/intervals?id=11111111-1111-4111-8111-111111111111", {
        method: "DELETE",
      }),
    )

    expect(workdayResponse.status).toBe(403)
    expect(publishResponse.status).toBe(403)
    expect(intervalCreateResponse.status).toBe(403)
    expect(intervalUpdateResponse.status).toBe(403)
    expect(intervalDeleteResponse.status).toBe(403)
    expect(mocked.prisma.workday.findFirst).not.toHaveBeenCalled()
    expect(mocked.prisma.workday.create).not.toHaveBeenCalled()
    expect(mocked.prisma.workday.update).not.toHaveBeenCalled()
    expect(mocked.prisma.workInterval.findFirst).not.toHaveBeenCalled()
    expect(mocked.prisma.workInterval.create).not.toHaveBeenCalled()
    expect(mocked.prisma.workInterval.update).not.toHaveBeenCalled()
    expect(mocked.prisma.workInterval.delete).not.toHaveBeenCalled()
  })

  it("blocks worker invitation management routes", async () => {
    const listResponse = await GET_INVITATIONS(
      new Request("http://localhost/api/invitations?status=pending"),
    )
    const createResponse = await POST_INVITATIONS(
      new Request("http://localhost/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "worker@example.com" }),
      }),
    )
    const deleteResponse = await DELETE_INVITATIONS(
      new Request("http://localhost/api/invitations?id=inv_1", {
        method: "DELETE",
      }),
    )
    const inviteCodeReadResponse = await GET_INVITE_CODES(
      new Request("http://localhost/api/invite-codes"),
    )
    const inviteCodeCreateResponse = await POST_INVITE_CODES(
      new Request("http://localhost/api/invite-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    )

    expect(listResponse.status).toBe(403)
    expect(createResponse.status).toBe(403)
    expect(deleteResponse.status).toBe(403)
    expect(inviteCodeReadResponse.status).toBe(403)
    expect(inviteCodeCreateResponse.status).toBe(403)
    expect(mocked.prisma.invitation.findMany).not.toHaveBeenCalled()
    expect(mocked.prisma.invitation.findFirst).not.toHaveBeenCalled()
    expect(mocked.prisma.invitation.create).not.toHaveBeenCalled()
    expect(mocked.prisma.invitation.delete).not.toHaveBeenCalled()
    expect(mocked.prisma.invitationCode.findFirst).not.toHaveBeenCalled()
    expect(mocked.createInviteCode).not.toHaveBeenCalled()
  })
})

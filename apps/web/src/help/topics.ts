import type { HelpDictionary, HelpLocale, HelpTopicDef } from '@care-platform/shared';
import en from './en.json';
import si from './si.json';
import ta from './ta.json';

/** The help's words, per language (see packages/shared/src/types/help.ts). */
export const HELP_DICTIONARIES: Record<HelpLocale, HelpDictionary> = { en, si, ta };

const OFFICE = ['ADMIN', 'STAFF'] as const;
const EVERYONE = ['ADMIN', 'STAFF', 'VERIFIER'] as const;
const ADMIN = ['ADMIN'] as const;

/**
 * The staff app's help topics: one per business task, in the order the help
 * lists them. `contexts` are the pages each one explains (paths after /staff);
 * the ? in the top bar offers the topics for the page it is on. Every page
 * with a `<HelpHint>` must name a topic listed here, which the tests check.
 */
export const HELP_TOPICS: HelpTopicDef[] = [
  {
    id: 'daily-dashboard',
    area: 'start',
    audiences: OFFICE,
    contexts: ['/dashboard', '/'],
    steps: 4,
    tips: 2,
    related: ['handle-request', 'manage-booking'],
    diagram: {
      frame: 'staff',
      nav: 'nav.dashboard',
      heading: { ui: 'dashboard.title' },
      blocks: [
        {
          kind: 'row',
          children: [
            { kind: 'field', text: { ui: 'dashboard.range.label' }, select: true, callout: 3 },
            { kind: 'button', text: { ui: 'dashboard.refresh' }, variant: 'secondary' },
          ],
        },
        {
          kind: 'card',
          title: { ui: 'dashboard.attention.title' },
          highlight: true,
          callout: 1,
          children: [{ kind: 'list', rows: 3, badge: { ui: 'dashboard.attention.newRequestsOver24h' } }],
        },
        { kind: 'card', title: { ui: 'dashboard.dials.title' }, callout: 4, children: [{ kind: 'text', lines: 2 }] },
      ],
    },
  },
  {
    id: 'handle-request',
    area: 'care',
    audiences: OFFICE,
    contexts: ['/requests', '/requests/[id]'],
    steps: 6,
    tips: 3,
    related: ['phone-request', 'create-booking', 'agent-proposals'],
    diagram: {
      frame: 'staff',
      nav: 'nav.requests',
      heading: { ui: 'requests.title' },
      blocks: [
        {
          kind: 'tabs',
          items: [{ ui: 'requests.tabs.open' }, { ui: 'requests.tabs.unmatched' }, { ui: 'requests.tabs.INTRODUCED' }, { ui: 'requests.tabs.CLOSED' }],
          callout: 1,
        },
        {
          kind: 'list',
          rows: 2,
          columns: [{ ui: 'requests.table.reference' }, { ui: 'requests.table.client' }, { ui: 'requests.table.status' }],
          badge: { ui: 'requests.status.NEW' },
        },
        {
          kind: 'card',
          title: { ui: 'requests.detail.handledBy' },
          children: [{ kind: 'button', text: { ui: 'requests.detail.assignToMe' }, variant: 'secondary', callout: 2 }],
        },
        {
          kind: 'card',
          title: { ui: 'suggestions.title' },
          callout: 3,
          children: [{ kind: 'buttons', items: [{ text: { ui: 'suggestions.find' } }, { text: { ui: 'suggestions.attach' }, variant: 'primary' }] }],
        },
        {
          kind: 'card',
          title: { ui: 'requests.detail.actions' },
          children: [
            {
              kind: 'buttons',
              items: [
                { text: { ui: 'requests.detail.move.PICK_UP' }, variant: 'primary', callout: 4 },
                { text: { ui: 'requests.detail.move.INTRODUCED' }, callout: 5 },
                { text: { ui: 'requests.detail.move.CLOSED' } },
              ],
            },
          ],
        },
        { kind: 'button', text: { ui: 'bookings.fromRequest.create' }, callout: 6 },
      ],
    },
  },
  {
    id: 'phone-request',
    area: 'care',
    audiences: OFFICE,
    contexts: ['/requests/new'],
    steps: 5,
    tips: 2,
    related: ['handle-request', 'people-waiting'],
    diagram: {
      frame: 'staff',
      nav: 'nav.requests',
      heading: { ui: 'requests.new.title' },
      blocks: [
        {
          kind: 'card',
          title: { ui: 'requests.new.callerTitle' },
          callout: 1,
          children: [
            { kind: 'tabs', items: [{ ui: 'requests.new.existingClient' }, { ui: 'requests.new.newCaller' }] },
            { kind: 'search', text: { placeholder: 'medium' } },
          ],
        },
        {
          kind: 'card',
          title: { ui: 'requests.new.caregiverTitle' },
          callout: 2,
          children: [{ kind: 'button', text: { ui: 'requests.new.matchLater' }, variant: 'secondary' }],
        },
        {
          kind: 'card',
          title: { ui: 'requests.new.requestTitle' },
          children: [
            { kind: 'field', text: { ui: 'requests.detail.careType' }, select: true, callout: 3 },
            { kind: 'field', text: { ui: 'requests.detail.phoneMessage' } },
            { kind: 'field', text: { ui: 'requests.new.language' }, select: true, callout: 4 },
          ],
        },
        { kind: 'button', text: { ui: 'requests.new.submit' }, callout: 5 },
      ],
    },
  },
  {
    id: 'people-waiting',
    area: 'care',
    audiences: OFFICE,
    contexts: ['/people-waiting'],
    steps: 3,
    tips: 1,
    related: ['handle-request'],
    diagram: {
      frame: 'staff',
      nav: 'nav.peopleWaiting',
      heading: { ui: 'peopleWaiting.title' },
      blocks: [
        {
          kind: 'card',
          callout: 1,
          children: [
            { kind: 'text', text: { placeholder: 'long' }, lines: 1 },
            { kind: 'badge', text: { label: 'asked' }, tone: 'muted' },
            { kind: 'field', text: { ui: 'peopleWaiting.note' }, callout: 2 },
            { kind: 'button', text: { ui: 'peopleWaiting.handle' }, callout: 3 },
          ],
        },
      ],
    },
  },
  {
    id: 'create-booking',
    area: 'care',
    audiences: OFFICE,
    contexts: ['/bookings', '/bookings/new'],
    steps: 6,
    tips: 2,
    related: ['manage-booking', 'care-plan', 'handle-request'],
    diagram: {
      frame: 'staff',
      nav: 'nav.bookings',
      heading: { ui: 'bookings.new.title' },
      blocks: [
        {
          kind: 'card',
          title: { ui: 'bookings.new.whoTitle' },
          callout: 1,
          children: [
            {
              kind: 'row',
              children: [
                { kind: 'field', text: { ui: 'bookings.table.client' } },
                { kind: 'field', text: { ui: 'bookings.table.caregiver' } },
              ],
            },
          ],
        },
        {
          kind: 'card',
          title: { ui: 'bookings.new.patternTitle' },
          callout: 2,
          children: [
            { kind: 'field', text: { ui: 'bookings.new.days' } },
            {
              kind: 'row',
              children: [
                { kind: 'field', text: { ui: 'bookings.new.startTime' } },
                { kind: 'field', text: { ui: 'bookings.new.endTime' } },
              ],
            },
            {
              kind: 'row',
              children: [
                { kind: 'field', text: { ui: 'bookings.new.startDate' } },
                { kind: 'field', text: { ui: 'bookings.new.endDate' } },
              ],
            },
          ],
        },
        {
          kind: 'card',
          title: { ui: 'bookings.new.rateTitle' },
          callout: 3,
          children: [
            {
              kind: 'row',
              children: [
                { kind: 'field', text: { ui: 'bookings.new.rateAmount' } },
                { kind: 'field', text: { ui: 'bookings.new.payRateAmount' } },
              ],
            },
          ],
        },
        { kind: 'field', text: { ui: 'bookings.billingTiming.label' }, select: true, callout: 4 },
        { kind: 'button', text: { ui: 'bookings.new.submit' }, callout: 5 },
      ],
    },
  },
  {
    id: 'manage-booking',
    area: 'care',
    audiences: OFFICE,
    contexts: ['/bookings/[id]'],
    steps: 6,
    tips: 3,
    related: ['create-booking', 'todays-visits', 'care-plan', 'correct-booking'],
    diagram: {
      frame: 'staff',
      nav: 'nav.bookings',
      blocks: [
        {
          kind: 'buttons',
          items: [
            { text: { ui: 'bookings.detail.confirm' }, variant: 'primary', callout: 1 },
            { text: { ui: 'bookings.detail.extend' }, callout: 4 },
            { text: { ui: 'bookings.detail.complete' } },
            { text: { ui: 'bookings.detail.cancel' }, variant: 'danger', callout: 5 },
          ],
        },
        {
          kind: 'card',
          title: { ui: 'bookings.payFirst.send' },
          callout: 2,
          children: [{ kind: 'button', text: { ui: 'bookings.payFirst.override' }, variant: 'link' }],
        },
        {
          kind: 'card',
          title: { ui: 'bookings.detail.roster' },
          callout: 3,
          children: [
            { kind: 'list', rows: 3 },
            {
              kind: 'buttons',
              items: [{ text: { ui: 'bookings.detail.editTimes' } }, { text: { ui: 'bookings.detail.cover' } }, { text: { ui: 'bookings.detail.addShift' } }],
            },
          ],
        },
        { kind: 'field', text: { ui: 'requests.detail.history' }, value: { ui: 'requests.detail.addNote' }, callout: 6 },
      ],
    },
  },
  {
    id: 'todays-visits',
    area: 'care',
    audiences: OFFICE,
    contexts: ['/bookings/today'],
    steps: 4,
    tips: 2,
    related: ['manage-booking'],
    diagram: {
      frame: 'staff',
      nav: 'nav.bookings',
      heading: { ui: 'visits.title' },
      blocks: [
        { kind: 'text', text: { ui: 'visits.lateHeading' }, callout: 1 },
        {
          kind: 'card',
          highlight: true,
          children: [
            { kind: 'text', text: { placeholder: 'long' }, lines: 1 },
            { kind: 'badge', text: { label: 'arrivalCode' }, tone: 'accent', callout: 2 },
            {
              kind: 'buttons',
              items: [
                { text: { ui: 'visits.recordIn' }, callout: 3 },
                { text: { ui: 'visits.recordOut' } },
                { text: { ui: 'visits.coverPanel.find' }, variant: 'primary', callout: 4 },
              ],
            },
          ],
        },
        { kind: 'list', rows: 2 },
      ],
    },
  },
  {
    id: 'care-plan',
    area: 'care',
    audiences: OFFICE,
    contexts: ['/bookings/[id]', '/care-plans', '/care-plans/[id]'],
    steps: 5,
    tips: 2,
    related: ['manage-booking'],
    diagram: {
      frame: 'staff',
      nav: 'nav.bookings',
      blocks: [
        {
          kind: 'card',
          title: { ui: 'carePlans.plan.title' },
          children: [
            { kind: 'field', text: { ui: 'carePlans.plan.startFrom' }, value: { ui: 'carePlans.plan.templates' }, select: true, callout: 1 },
            {
              kind: 'card',
              title: { ui: 'carePlans.editor.activities' },
              callout: 2,
              children: [
                {
                  kind: 'checklist',
                  items: [
                    { text: { label: 'tablets' }, state: 'open' },
                    { text: { label: 'walk' }, state: 'open' },
                  ],
                },
                {
                  kind: 'row',
                  children: [
                    { kind: 'badge', text: { ui: 'carePlans.editor.critical' }, tone: 'accent', callout: 3 },
                    { kind: 'button', text: { ui: 'carePlans.editor.add' }, variant: 'secondary' },
                  ],
                },
              ],
            },
            { kind: 'field', text: { ui: 'carePlans.plan.effectiveFrom' }, callout: 4 },
            {
              kind: 'buttons',
              items: [
                { text: { ui: 'carePlans.plan.create' }, variant: 'primary' },
                { text: { ui: 'carePlans.plan.saveAsTemplate' }, callout: 5 },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: 'correct-booking',
    area: 'care',
    audiences: OFFICE,
    contexts: ['/bookings/[id]'],
    steps: 5,
    tips: 2,
    related: ['manage-booking', 'create-invoice', 'pay-caregivers'],
    diagram: {
      frame: 'staff',
      nav: 'nav.bookings',
      heading: { ui: 'bookings.correct.title' },
      blocks: [
        { kind: 'field', text: { ui: 'bookings.correct.reason' }, callout: 1 },
        { kind: 'buttons', items: [{ text: { ui: 'bookings.correct.pickShift' }, callout: 2 }, { text: { ui: 'bookings.correct.addMissing' } }] },
        { kind: 'button', text: { ui: 'bookings.correct.preview' }, variant: 'secondary', callout: 3 },
        { kind: 'card', title: { ui: 'bookings.correct.documentsTitle' }, callout: 4, children: [{ kind: 'list', rows: 2 }] },
        { kind: 'button', text: { ui: 'bookings.correct.apply' }, callout: 5 },
      ],
    },
  },
  {
    id: 'register-caregiver',
    area: 'people',
    audiences: OFFICE,
    contexts: ['/caregivers', '/caregivers/new'],
    steps: 5,
    tips: 2,
    related: ['verify-caregiver'],
    diagram: {
      frame: 'staff',
      nav: 'nav.caregivers',
      heading: { ui: 'caregivers.wizard.title' },
      blocks: [
        {
          kind: 'tabs',
          items: [
            { ui: 'caregivers.wizard.steps.personal' },
            { ui: 'caregivers.wizard.steps.qualifications' },
            { ui: 'caregivers.wizard.steps.skills' },
            { ui: 'caregivers.wizard.steps.documents' },
          ],
          callout: 1,
        },
        {
          kind: 'row',
          children: [
            { kind: 'field', text: { label: 'fullName' } },
            { kind: 'field', text: { label: 'phone' } },
          ],
        },
        { kind: 'field', text: { ui: 'caregivers.me.documents.documentType' }, select: true, callout: 3 },
        { kind: 'buttons', items: [{ text: { ui: 'caregivers.wizard.back' } }, { text: { ui: 'caregivers.wizard.next' }, variant: 'primary', callout: 2 }] },
        { kind: 'button', text: { ui: 'caregivers.wizard.finish' }, callout: 4 },
      ],
    },
  },
  {
    id: 'verify-caregiver',
    area: 'people',
    audiences: EVERYONE,
    contexts: ['/caregivers/[id]', '/caregivers', '/dashboard'],
    steps: 6,
    tips: 2,
    related: ['register-caregiver'],
    diagram: {
      frame: 'staff',
      nav: 'nav.caregivers',
      blocks: [
        {
          kind: 'row',
          children: [
            { kind: 'title', text: { placeholder: 'medium' } },
            { kind: 'field', text: { ui: 'lifecycle.changeStatus' }, value: { ui: 'lifecycle.moveTo' }, select: true, callout: 6 },
          ],
        },
        {
          kind: 'tabs',
          items: [
            { ui: 'caregivers.profile.tabs.overview' },
            { ui: 'caregivers.profile.tabs.documents' },
            { ui: 'caregivers.profile.tabs.references' },
            { ui: 'caregivers.profile.tabs.verification' },
          ],
          active: 1,
          callout: 2,
        },
        { kind: 'card', title: { ui: 'caregivers.verificationFile.title' }, callout: 1, children: [{ kind: 'text', lines: 2 }] },
        {
          kind: 'row',
          children: [
            { kind: 'text', text: { placeholder: 'long' }, lines: 1 },
            {
              kind: 'buttons',
              items: [{ text: { ui: 'caregivers.edit.verify' }, variant: 'primary', callout: 3 }, { text: { ui: 'caregivers.edit.markRejected' } }],
            },
          ],
        },
        { kind: 'button', text: { ui: 'caregivers.edit.addVerification' }, variant: 'secondary', callout: 5 },
      ],
    },
  },
  {
    id: 'manage-clients',
    area: 'people',
    audiences: OFFICE,
    contexts: ['/clients', '/clients/new', '/clients/[id]'],
    steps: 4,
    tips: 2,
    related: ['phone-request', 'handle-request'],
    diagram: {
      frame: 'staff',
      nav: 'nav.clients',
      heading: { ui: 'clients.title' },
      blocks: [
        {
          kind: 'row',
          children: [
            { kind: 'search', text: { ui: 'clients.search' }, callout: 1 },
            { kind: 'button', text: { ui: 'clients.add' }, callout: 2 },
          ],
        },
        { kind: 'list', rows: 3, columns: [{ ui: 'clients.table.name' }, { ui: 'clients.table.phone' }, { ui: 'clients.table.status' }] },
        {
          kind: 'card',
          title: { ui: 'lifecycle.client.statusTitle' },
          callout: 3,
          children: [{ kind: 'field', text: { ui: 'lifecycle.changeStatus' }, value: { ui: 'lifecycle.moveTo' }, select: true }],
        },
        { kind: 'button', text: { ui: 'requests.newRequestForClient' }, variant: 'secondary', callout: 4 },
      ],
    },
  },
  {
    id: 'moderate-reviews',
    area: 'people',
    audiences: OFFICE,
    contexts: ['/reviews'],
    steps: 4,
    tips: 1,
    related: ['manage-booking'],
    diagram: {
      frame: 'staff',
      nav: 'nav.reviews',
      heading: { ui: 'reviews.title' },
      blocks: [
        {
          kind: 'tabs',
          items: [{ ui: 'reviews.tabs.pending' }, { ui: 'reviews.tabs.low' }, { ui: 'reviews.tabs.hidden' }, { ui: 'reviews.tabs.all' }],
          callout: 1,
        },
        {
          kind: 'card',
          children: [
            { kind: 'stars', filled: 4 },
            { kind: 'text', text: { ui: 'reviews.writtenReview' }, lines: 2, callout: 2 },
            {
              kind: 'buttons',
              items: [
                { text: { ui: 'reviews.approve' }, variant: 'primary', callout: 3 },
                { text: { ui: 'reviews.reject' } },
                { text: { ui: 'reviews.hide' }, variant: 'danger', callout: 4 },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: 'create-invoice',
    area: 'money',
    audiences: OFFICE,
    contexts: ['/invoices', '/invoices/new', '/invoices/[id]'],
    steps: 6,
    tips: 3,
    related: ['pay-caregivers', 'correct-booking'],
    diagram: {
      frame: 'staff',
      nav: 'nav.invoices',
      heading: { ui: 'billing.invoice.draftTitle' },
      blocks: [
        {
          kind: 'card',
          title: { ui: 'billing.invoice.lines' },
          callout: 2,
          children: [
            { kind: 'list', rows: 3 },
            { kind: 'button', text: { ui: 'billing.invoice.addShifts' }, variant: 'secondary' },
          ],
        },
        { kind: 'field', text: { ui: 'billing.invoice.discount' }, value: { ui: 'billing.invoice.noDiscount' }, select: true, callout: 3 },
        { kind: 'buttons', items: [{ text: { ui: 'billing.invoice.preview' } }, { text: { ui: 'billing.invoice.issue' }, variant: 'primary', callout: 4 }] },
        {
          kind: 'card',
          title: { ui: 'billing.payments.title' },
          callout: 5,
          children: [{ kind: 'button', text: { ui: 'billing.payments.record' }, variant: 'secondary' }],
        },
        {
          kind: 'buttons',
          items: [
            { text: { ui: 'billing.invoice.revise' }, callout: 6 },
            { text: { ui: 'billing.invoice.void' }, variant: 'danger' },
          ],
        },
      ],
    },
  },
  {
    id: 'pay-caregivers',
    area: 'money',
    audiences: OFFICE,
    contexts: ['/payouts', '/payouts/[id]'],
    steps: 5,
    tips: 2,
    related: ['create-invoice', 'correct-booking'],
    diagram: {
      frame: 'staff',
      nav: 'nav.payouts',
      heading: { ui: 'billing.payouts.title' },
      blocks: [
        {
          kind: 'card',
          title: { ui: 'billing.payouts.runTitle' },
          callout: 1,
          children: [
            {
              kind: 'row',
              children: [
                { kind: 'field', text: { ui: 'billing.newInvoice.from' } },
                { kind: 'field', text: { ui: 'billing.newInvoice.to' } },
              ],
            },
            { kind: 'button', text: { ui: 'billing.payouts.run' } },
          ],
        },
        { kind: 'list', rows: 2, columns: [{ label: 'statement' }, { ui: 'requests.table.status' }], callout: 2 },
        {
          kind: 'buttons',
          items: [
            { text: { ui: 'billing.payout.approve' }, variant: 'primary', callout: 3 },
            { text: { ui: 'billing.payout.markPaid' }, callout: 4 },
          ],
        },
      ],
    },
  },
  {
    id: 'agent-proposals',
    area: 'automation',
    audiences: OFFICE,
    contexts: ['/agent-proposals', '/settings/automation'],
    steps: 4,
    tips: 2,
    related: ['staff-assistant', 'handle-request'],
    diagram: {
      frame: 'staff',
      nav: 'nav.dashboard',
      heading: { ui: 'automation.proposals.title' },
      blocks: [
        {
          kind: 'card',
          highlight: true,
          callout: 1,
          children: [
            { kind: 'text', text: { placeholder: 'long' }, lines: 2 },
            {
              kind: 'buttons',
              items: [
                { text: { ui: 'automation.case.approve' }, variant: 'primary', callout: 2 },
                { text: { ui: 'automation.case.decline' } },
                { text: { ui: 'automation.proposals.open' }, variant: 'link' },
              ],
            },
          ],
        },
        {
          kind: 'card',
          title: { ui: 'automation.case.agentHandling' },
          callout: 3,
          children: [{ kind: 'button', text: { ui: 'automation.case.takeOver' }, variant: 'secondary' }],
        },
        {
          kind: 'tabs',
          items: [
            { ui: 'automation.modes.MANUAL.name' },
            { ui: 'automation.modes.SHADOW.name' },
            { ui: 'automation.modes.ASSIST.name' },
            { ui: 'automation.modes.AUTO.name' },
          ],
          active: 2,
          callout: 4,
        },
      ],
    },
  },
  {
    id: 'staff-assistant',
    area: 'automation',
    audiences: OFFICE,
    contexts: ['/assistant'],
    steps: 4,
    tips: 2,
    related: ['agent-proposals'],
    diagram: {
      frame: 'staff',
      heading: { ui: 'assistant.title' },
      blocks: [
        { kind: 'button', text: { ui: 'assistant.new' }, variant: 'secondary', callout: 1 },
        { kind: 'text', text: { placeholder: 'long' }, lines: 2 },
        {
          kind: 'card',
          highlight: true,
          callout: 3,
          children: [
            { kind: 'text', lines: 1 },
            { kind: 'buttons', items: [{ text: { ui: 'assistant.approve' }, variant: 'primary' }, { text: { ui: 'assistant.reject' } }] },
          ],
        },
        {
          kind: 'row',
          children: [
            { kind: 'field', text: { ui: 'assistant.placeholder' }, callout: 2 },
            { kind: 'button', text: { ui: 'assistant.send' } },
          ],
        },
      ],
    },
  },
  {
    id: 'manage-users',
    area: 'admin',
    audiences: ADMIN,
    contexts: ['/settings/users', '/settings', '/users'],
    steps: 4,
    tips: 2,
    related: ['set-up-branding'],
    diagram: {
      frame: 'staff',
      nav: 'nav.settings',
      heading: { ui: 'users.title' },
      blocks: [
        {
          kind: 'row',
          children: [
            { kind: 'search', text: { ui: 'users.search' } },
            { kind: 'button', text: { ui: 'users.addNew' }, callout: 1 },
          ],
        },
        { kind: 'list', rows: 3, columns: [{ ui: 'users.table.name' }, { ui: 'users.table.role' }, { ui: 'users.table.status' }], callout: 2 },
        {
          kind: 'buttons',
          items: [
            { text: { ui: 'users.actions.resetPassword' }, callout: 3 },
            { text: { ui: 'users.actions.deactivate' }, callout: 4 },
          ],
        },
      ],
    },
  },
  {
    id: 'set-up-branding',
    area: 'admin',
    audiences: ADMIN,
    contexts: ['/settings/branding', '/settings'],
    steps: 5,
    tips: 2,
    related: ['manage-users'],
    diagram: {
      frame: 'staff',
      nav: 'nav.settings',
      heading: { ui: 'settings.branding' },
      blocks: [
        {
          kind: 'card',
          title: { ui: 'brandingAdmin.companyTitle' },
          callout: 1,
          children: [
            {
              kind: 'row',
              children: [
                { kind: 'field', text: { ui: 'brandingAdmin.companyName' } },
                { kind: 'field', text: { ui: 'brandingAdmin.shortName' } },
              ],
            },
          ],
        },
        {
          kind: 'card',
          title: { ui: 'brandingAdmin.artworkTitle' },
          callout: 2,
          children: [{ kind: 'button', text: { ui: 'brandingAdmin.upload' }, variant: 'secondary' }],
        },
        {
          kind: 'card',
          title: { ui: 'brandingAdmin.colorsTitle' },
          callout: 3,
          children: [
            {
              kind: 'row',
              children: [
                { kind: 'field', text: { ui: 'brandingAdmin.primaryColor' } },
                { kind: 'field', text: { ui: 'brandingAdmin.accentColor' } },
              ],
            },
          ],
        },
        {
          kind: 'card',
          title: { ui: 'brandingAdmin.languagesTitle' },
          callout: 4,
          children: [{ kind: 'field', text: { ui: 'brandingAdmin.defaultLanguage' }, select: true }],
        },
        { kind: 'button', text: { ui: 'common.save' }, callout: 5 },
      ],
    },
  },
];

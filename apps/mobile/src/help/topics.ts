import type { HelpDictionary, HelpLocale, HelpTopicDef } from '@care-platform/shared';
import en from './en.json';
import si from './si.json';
import ta from './ta.json';

/** The help's words, per language (see packages/shared/src/types/help.ts). */
export const HELP_DICTIONARIES: Record<HelpLocale, HelpDictionary> = { en, si, ta };

const CLIENT = ['CLIENT'] as const;
const CAREGIVER = ['CAREGIVER'] as const;
const SIGNED_IN = ['CLIENT', 'CAREGIVER'] as const;
const EVERYONE = ['GUEST', 'CLIENT', 'CAREGIVER'] as const;

const CLIENT_TABS = ['nav.home', 'nav.find', 'account.nav.bookings', 'nav.myAccount'];
const CAREGIVER_TABS = ['nav.home', 'portal.nav.shifts', 'portal.nav.payments', 'nav.myAccount'];

/**
 * The mobile app's help topics: one per thing a client or caregiver sets out
 * to do. `contexts` are the screens' paths as expo-router reports them (route
 * groups such as (client) are not part of the path); the ? in a screen's
 * header offers the topics for that screen.
 */
export const HELP_TOPICS: HelpTopicDef[] = [
  {
    id: 'get-started',
    area: 'start',
    audiences: EVERYONE,
    contexts: ['/', '/get-started', '/sign-in', '/register', '/verify'],
    steps: 5,
    tips: 2,
    related: ['find-caregiver', 'caregiver-documents'],
    diagram: {
      frame: 'phone',
      heading: { ui: 'signup.chooseTitle' },
      blocks: [
        { kind: 'tabs', items: [{ ui: 'start.needCare' }, { ui: 'start.caregiver' }], callout: 1 },
        {
          kind: 'card',
          callout: 2,
          children: [
            { kind: 'button', text: { ui: 'signup.whatsapp' } },
            { kind: 'button', text: { ui: 'signup.email' }, variant: 'secondary' },
          ],
        },
        { kind: 'field', text: { ui: 'signup.code' }, callout: 3 },
        { kind: 'button', text: { ui: 'signup.submit' }, callout: 4 },
        { kind: 'button', text: { ui: 'signup.callOffice.title' }, variant: 'link', callout: 5 },
      ],
    },
  },
  {
    id: 'find-caregiver',
    area: 'care',
    audiences: ['GUEST', 'CLIENT'],
    contexts: ['/find', '/caregivers/[publicId]', '/start', '/saved'],
    steps: 5,
    tips: 2,
    related: ['ask-for-care', 'get-started'],
    diagram: {
      frame: 'phone',
      tabs: CLIENT_TABS,
      tab: 1,
      heading: { ui: 'welcome.tagline' },
      blocks: [
        { kind: 'tabs', items: [{ ui: 'searchMode.normal' }, { ui: 'searchMode.ai' }], callout: 1 },
        { kind: 'field', text: { ui: 'normalSearch.careType' }, select: true, callout: 2 },
        {
          kind: 'row',
          children: [
            { kind: 'field', text: { ui: 'normalSearch.district' }, select: true },
            { kind: 'field', text: { ui: 'normalSearch.city' }, select: true },
          ],
        },
        { kind: 'button', text: { ui: 'normalSearch.submit' } },
        {
          kind: 'card',
          callout: 3,
          children: [
            {
              kind: 'row',
              children: [
                { kind: 'title', text: { placeholder: 'medium' } },
                { kind: 'badge', text: { ui: 'results.verified' } },
              ],
            },
            { kind: 'stars', filled: 5 },
            {
              kind: 'buttons',
              items: [
                { text: { ui: 'care.contactCta' }, variant: 'primary', callout: 4 },
                { text: { ui: 'care.save' }, callout: 5 },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: 'ask-for-care',
    area: 'care',
    audiences: CLIENT,
    contexts: ['/requests', '/start', '/find'],
    steps: 4,
    tips: 2,
    related: ['find-caregiver', 'follow-visits'],
    diagram: {
      frame: 'phone',
      heading: { ui: 'account.requests.title' },
      blocks: [
        { kind: 'button', text: { ui: 'account.requests.newRequest' }, callout: 1 },
        {
          kind: 'card',
          title: { ui: 'account.requests.matching' },
          callout: 2,
          children: [
            { kind: 'text', text: { label: 'reference' } },
            { kind: 'badge', text: { label: 'status' }, tone: 'accent' },
            { kind: 'button', text: { ui: 'account.requests.cancel' }, variant: 'link', callout: 4 },
          ],
        },
        { kind: 'button', text: { ui: 'talk.title' }, variant: 'secondary', callout: 3 },
      ],
    },
  },
  {
    id: 'follow-visits',
    area: 'care',
    audiences: CLIENT,
    contexts: ['/bookings', '/start'],
    steps: 5,
    tips: 2,
    related: ['tick-off-care', 'rate-caregiver', 'pay-invoice'],
    diagram: {
      frame: 'phone',
      tabs: CLIENT_TABS,
      tab: 2,
      heading: { ui: 'account.bookings.title' },
      blocks: [
        { kind: 'card', title: { ui: 'checkIn.client.title' }, callout: 2, highlight: true, children: [{ kind: 'title', text: { label: 'code' } }] },
        { kind: 'card', title: { label: 'onTheWay' }, callout: 3, children: [{ kind: 'map' }, { kind: 'text', text: { label: 'minutesAway' } }] },
        {
          kind: 'card',
          callout: 1,
          children: [
            { kind: 'text', text: { ui: 'account.bookings.shifts' }, lines: 2 },
            { kind: 'text', text: { label: 'arrived' } },
          ],
        },
        { kind: 'button', text: { ui: 'issues.report' }, variant: 'link', callout: 5 },
      ],
    },
  },
  {
    id: 'tick-off-care',
    area: 'care',
    audiences: CLIENT,
    contexts: ['/bookings'],
    steps: 4,
    tips: 2,
    related: ['follow-visits'],
    diagram: {
      frame: 'phone',
      tabs: CLIENT_TABS,
      tab: 2,
      blocks: [
        {
          kind: 'card',
          title: { ui: 'carePlan.todayTitle' },
          children: [
            { kind: 'buttons', items: [{ text: { ui: 'carePlan.previousDay' }, callout: 4 }, { text: { ui: 'carePlan.nextDay' } }] },
            { kind: 'text', text: { label: 'tablets' } },
            {
              kind: 'buttons',
              items: [
                { text: { ui: 'carePlan.done' }, variant: 'primary', callout: 2 },
                { text: { ui: 'carePlan.notDone' }, callout: 3 },
              ],
            },
            { kind: 'badge', text: { ui: 'carePlan.important' }, tone: 'accent', callout: 1 },
          ],
        },
      ],
    },
  },
  {
    id: 'rate-caregiver',
    area: 'care',
    audiences: CLIENT,
    contexts: ['/bookings', '/bookings/[id]/rate/[publicId]'],
    steps: 4,
    tips: 2,
    related: ['follow-visits'],
    diagram: {
      frame: 'phone',
      heading: { ui: 'reviews.form.title' },
      blocks: [
        { kind: 'button', text: { ui: 'reviews.rateNow' }, callout: 1 },
        { kind: 'stars', filled: 4, callout: 2 },
        {
          kind: 'row',
          children: [
            { kind: 'badge', text: { label: 'badgeOne' } },
            { kind: 'badge', text: { label: 'badgeTwo' } },
          ],
        },
        { kind: 'field', text: { label: 'writeReview' }, callout: 3 },
        { kind: 'button', text: { ui: 'reviews.edit' }, variant: 'link', callout: 4 },
      ],
    },
  },
  {
    id: 'pay-invoice',
    area: 'money',
    audiences: CLIENT,
    contexts: ['/invoices', '/invoices/[id]', '/bookings'],
    steps: 4,
    tips: 2,
    related: ['follow-visits'],
    diagram: {
      frame: 'phone',
      heading: { ui: 'invoices.title' },
      blocks: [
        { kind: 'list', rows: 2, badge: { ui: 'invoices.overdue' }, callout: 1 },
        {
          kind: 'card',
          title: { ui: 'invoices.pay.title' },
          callout: 2,
          children: [
            { kind: 'field', text: { ui: 'invoices.pay.email' } },
            { kind: 'button', text: { ui: 'invoices.pay.button' } },
          ],
        },
        { kind: 'button', text: { ui: 'invoices.pdf.download' }, variant: 'secondary', callout: 4 },
      ],
    },
  },
  {
    id: 'caregiver-documents',
    area: 'work',
    audiences: CAREGIVER,
    contexts: ['/home', '/documents', '/profile'],
    steps: 5,
    tips: 2,
    related: ['job-offers', 'set-rates'],
    diagram: {
      frame: 'phone',
      heading: { ui: 'portal.documents.title' },
      blocks: [
        {
          kind: 'card',
          title: { ui: 'portal.documents.needed' },
          callout: 1,
          children: [
            {
              kind: 'checklist',
              items: [
                { text: { label: 'nic' }, state: 'done' },
                { text: { label: 'certificate' }, state: 'open' },
              ],
            },
          ],
        },
        { kind: 'field', text: { ui: 'portal.documents.type' }, select: true, callout: 2 },
        { kind: 'buttons', items: [{ text: { ui: 'portal.documents.takePhoto' }, callout: 3 }, { text: { ui: 'portal.documents.choosePhoto' } }] },
        { kind: 'field', text: { ui: 'portal.documents.expiresOn' } },
        { kind: 'button', text: { ui: 'portal.documents.upload' }, callout: 4 },
      ],
    },
  },
  {
    id: 'job-offers',
    area: 'work',
    audiences: CAREGIVER,
    contexts: ['/offers', '/home'],
    steps: 4,
    tips: 2,
    related: ['work-a-shift'],
    diagram: {
      frame: 'phone',
      heading: { ui: 'portal.offers.title' },
      blocks: [
        {
          kind: 'card',
          title: { ui: 'portal.offers.waiting' },
          highlight: true,
          callout: 1,
          children: [
            { kind: 'field', text: { ui: 'portal.offers.where' }, value: { placeholder: 'medium' } },
            { kind: 'field', text: { ui: 'portal.offers.rate' }, value: { placeholder: 'short' } },
            { kind: 'text', text: { ui: 'portal.offers.privacy' } },
            {
              kind: 'buttons',
              items: [
                { text: { ui: 'portal.offers.accept' }, variant: 'primary', callout: 2 },
                { text: { ui: 'portal.offers.decline' }, callout: 3 },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: 'work-a-shift',
    area: 'work',
    audiences: CAREGIVER,
    contexts: ['/shifts', '/home'],
    steps: 6,
    tips: 3,
    related: ['job-offers', 'caregiver-payments'],
    diagram: {
      frame: 'phone',
      tabs: CAREGIVER_TABS,
      tab: 1,
      heading: { ui: 'portal.shifts.bookedTitle' },
      blocks: [
        {
          kind: 'card',
          highlight: true,
          children: [
            { kind: 'text', text: { placeholder: 'long' }, lines: 1 },
            { kind: 'button', text: { ui: 'onMyWay.start' }, variant: 'secondary', callout: 1 },
            {
              kind: 'row',
              children: [
                { kind: 'field', text: { ui: 'checkIn.caregiver.codeLabel' }, callout: 2 },
                { kind: 'button', text: { ui: 'checkIn.caregiver.checkIn' } },
              ],
            },
            { kind: 'button', text: { ui: 'carePlan.showPlan' }, variant: 'link', callout: 3 },
            { kind: 'button', text: { ui: 'checkIn.caregiver.checkOut' }, variant: 'secondary', callout: 4 },
            { kind: 'button', text: { ui: 'portal.shifts.cantMake.button' }, variant: 'link', callout: 5 },
          ],
        },
        { kind: 'button', text: { ui: 'issues.reportShort' }, variant: 'link', callout: 6 },
      ],
    },
  },
  {
    id: 'set-rates',
    area: 'work',
    audiences: CAREGIVER,
    contexts: ['/rates', '/me'],
    steps: 3,
    tips: 1,
    related: ['job-offers', 'caregiver-payments'],
    diagram: {
      frame: 'phone',
      heading: { ui: 'portal.rates.title' },
      blocks: [
        {
          kind: 'card',
          callout: 1,
          children: [
            { kind: 'title', text: { label: 'careType' } },
            { kind: 'field', text: { ui: 'portal.rates.rate' } },
            { kind: 'text', text: { label: 'band' } },
          ],
        },
        { kind: 'text', text: { label: 'clientSees' }, callout: 2 },
        { kind: 'button', text: { ui: 'portal.rates.save' }, callout: 3 },
      ],
    },
  },
  {
    id: 'caregiver-payments',
    area: 'money',
    audiences: CAREGIVER,
    contexts: ['/payments', '/ratings'],
    steps: 3,
    tips: 2,
    related: ['work-a-shift'],
    diagram: {
      frame: 'phone',
      tabs: CAREGIVER_TABS,
      tab: 2,
      heading: { ui: 'portal.payments.title' },
      blocks: [
        {
          kind: 'card',
          callout: 1,
          children: [
            { kind: 'title', text: { label: 'amount' } },
            { kind: 'text', text: { ui: 'portal.payments.approvedHint' } },
          ],
        },
        {
          kind: 'card',
          callout: 2,
          children: [
            { kind: 'title', text: { label: 'amount' } },
            { kind: 'text', text: { label: 'paid' } },
          ],
        },
        { kind: 'button', text: { ui: 'reviews.caregiver.title' }, variant: 'link', callout: 3 },
      ],
    },
  },
  {
    id: 'talk-to-person',
    area: 'account',
    audiences: SIGNED_IN,
    contexts: ['/talk'],
    steps: 4,
    tips: 1,
    related: ['account-settings'],
    diagram: {
      frame: 'phone',
      heading: { ui: 'talk.title' },
      blocks: [
        { kind: 'field', text: { ui: 'talk.message' }, callout: 1 },
        { kind: 'field', text: { ui: 'talk.about' }, value: { ui: 'talk.aboutNone' }, select: true, callout: 2 },
        { kind: 'field', text: { ui: 'talk.contact' }, select: true, callout: 3 },
        { kind: 'button', text: { ui: 'talk.send' }, callout: 4 },
      ],
    },
  },
  {
    id: 'account-settings',
    area: 'account',
    audiences: SIGNED_IN,
    contexts: ['/account', '/me', '/care-places', '/communication-preferences', '/notifications', '/delete-account'],
    steps: 5,
    tips: 2,
    related: ['talk-to-person'],
    diagram: {
      frame: 'phone',
      tabs: CLIENT_TABS,
      tab: 3,
      heading: { ui: 'nav.myAccount' },
      blocks: [
        { kind: 'button', text: { ui: 'places.title' }, variant: 'secondary', callout: 1 },
        { kind: 'button', text: { ui: 'commsPrefs.title' }, variant: 'secondary', callout: 2 },
        { kind: 'button', text: { ui: 'common.language' }, variant: 'secondary', callout: 3 },
        { kind: 'button', text: { ui: 'nav.signOut' }, variant: 'secondary', callout: 4 },
        { kind: 'button', text: { ui: 'deleteAccount.title' }, variant: 'link', callout: 5 },
      ],
    },
  },
];

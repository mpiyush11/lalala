/**
 * Single source of truth for every user-facing string in the Owner Cockpit.
 *
 * Why this file exists: the cockpit vocabulary has now been rewritten three
 * times (English → Hinglish → operational English). Each pass meant a sed
 * sweep across ~15 components, and each pass left stragglers that only a DOM
 * scan caught. Centralising the words turns a vocabulary change into a
 * one-file diff that can be reviewed on its own, and lets CI assert the banned
 * list against source rather than against a rendered page.
 *
 * Rules:
 *   - Every string an owner can read lives here. No inline literals in
 *     `src/app/owner/**`.
 *   - Anything parameterised is a function, so the call site cannot drift from
 *     the template.
 *   - `BANNED_WORDS` is enforced by `scripts/check-copy.mjs` in `npm test`.
 */

/**
 * Vocabulary the product must never show an operator.
 *
 * Developer jargon ("Variance", "Reconciliation"), cryptography language that
 * means nothing at a front desk, and the Hinglish experiment that was
 * subsequently rolled back.
 */
export const BANNED_WORDS = [
  'Variance',
  'Cryptographic',
  'Authenticator',
  'Win-Back',
  'Win-back',
  'Lapsed',
  'Petty',
  'Disbursed',
  'Reconciliation',
  'Galla',
  'Kharcha',
] as const;

export const ownerCopy = {
  /** Left sidebar and mobile tab bar. */
  nav: {
    brandSubtitle: 'Owner Cockpit',
    deskStatus: (staffName: string) => `${staffName} on Desk`,
    deskStatusEmpty: 'Nobody on Desk',
    menu: {
      settings: 'Gym Settings',
      signOut: 'Sign Out',
      staff: 'Staff & Trainers',
      switchToDesk: 'Switch to Front Desk',
      verifyBill: 'Verify Member Bill',
    },
    sections: {
      dues: 'Dues',
      home: 'Home',
      plans: 'Plans',
      staff: 'Staff & Shifts',
    },
    tabs: {
      dues: 'Dues',
      home: 'Home',
      plans: 'Plans',
      staff: 'Staff',
    },
  },

  /** Slim context strip at the top of the cockpit. */
  status: {
    bankUpiToday: 'Bank UPI Today',
    cashSplit: (cash: string, upi: string) => `${cash} Cash · ${upi} UPI/Bank`,
    collectionsToday: "Today's Collections",
    drawerCash: 'Drawer Cash',
    expensesNeedApproval: (count: number) =>
      `${count} Expense${count === 1 ? '' : 's'} Need Approval`,
    extraCash: (amount: string) => `Extra Cash: +${amount}`,
    noShiftOpen: 'No shift open',
    shiftOpen: (staffName: string) => `Shift OPEN (${staffName})`,
    shortBy: (amount: string) => `Drawer Short: -${amount}`,
  },

  /** Instant member and receipt lookup. */
  search: {
    ariaLabel: 'Search members and receipts',
    collect: 'Collect',
    dueLabel: (amount: string) => `${amount} due`,
    empty: (term: string) => `No member or receipt matching “${term}”`,
    hint: 'Search by name, phone, or receipt code',
    noDues: 'No dues',
    openLedger: 'Ledger',
    placeholder: 'Search member by name or phone...',
    receiptBadge: 'RECEIPT',
    searching: 'Searching…',
    viewReceipt: 'View bill',
  },

  /** Expense approval queue. */
  expenses: {
    allVerified: '✓ All expenses verified',
    approve: 'Approve',
    askStaff: 'Reject',
    byStaff: (staffName: string) => `by ${staffName}`,
    categories: {
      housekeeping: 'Cleaning',
      other: 'Other',
      repairs: 'Repair Work',
      staff_advance: 'Staff Advance',
      water_camper: 'Water Camper',
    } as Record<string, string>,
    drawerWarning: (amount: string) =>
      `⚠ Rejecting puts ${amount} back into the drawer — the cash you should find goes up by this much.`,
    empty: '✓ No expenses waiting to be checked.',
    heading: 'Expenses to Check',
    rejectCancel: 'Cancel',
    rejectConfirm: 'Confirm',
    rejectPending: 'Sending…',
    rejectPlaceholder: 'e.g. No bill attached, please share it',
    rejectPrompt: 'What do you want to ask?',
    rejectTitle: (amount: string) => `Ask staff about ${amount}?`,
    saving: '…',
  },

  /** Urgent pending dues list and the in-page collection sheet. */
  dues: {
    collect: 'Collect',
    collectAmount: 'Amount taking (₹)',
    collectBalance: (amount: string) => `Balance ${amount}`,
    collectCancel: 'Cancel',
    collectConfirm: 'Payment Received',
    collectNote: 'Reference note',
    collectNoteOptional: '(optional)',
    collectNotePlaceholder: 'e.g. UPI ref 4471',
    collectSaving: 'Saving…',
    collectTitle: (memberName: string) => `Collect from ${memberName}`,
    dueOn: (date: string) => `Due ${date}`,
    empty: '✓ No pending dues. Everyone has paid.',
    heading: 'Urgent Pending Dues',
    highPriority: 'High priority',
    modeCash: '💵 Cash',
    modeUpi: '📲 UPI',
    noDate: 'No date given',
    overdueDays: (days: number) => `${days} days overdue`,
    viewAll: (count: number) => `View all ${count} pending dues →`,
    whatsapp: '💬 WhatsApp',
    /** Reminder text; the UPI handle always comes from tenant settings. */
    whatsappMessage: (memberName: string, amount: string, gymName: string, upiId: string) =>
      `Hi ${memberName}, your gym fee of ${amount} is pending at ${gymName}. ` +
      `Please settle via UPI to ${upiId}. Thank you!`,
  },

  /** The cash box: drawer maths and shift closure. */
  drawer: {
    cashAtStart: 'Cash at shift start',
    cashCollected: 'Cash collected',
    closeCancel: 'Cancel',
    closeConfirm: 'Confirm & Close',
    closeCta: 'Verify & Close Shift',
    closePending: 'Closing…',
    closeTitle: (staffName: string) => `Close ${staffName}'s shift?`,
    closeWarning: 'Closing is permanent. Nothing in this shift can be edited afterwards.',
    countedCash: 'Counted Cash (₹)',
    countedCashShort: 'Counted Cash',
    countPlaceholder: 'Count the drawer and type the total',
    differenceExtra: (amount: string) => `Extra Cash +${amount}`,
    differenceLabel: 'Difference',
    differenceMatch: '✓ Drawer Matches',
    differenceShort: (amount: string) => `Short by -${amount}`,
    expectedCash: 'Expected Cash',
    expensesPaidOut: 'Expenses paid out',
    heading: 'Cash Drawer Today',
    noShift: 'No shift running right now.',
    reasonLabel: 'Reason for the difference',
    reasonPlaceholder: 'e.g. ₹50 change given, not recorded',
    shiftEndedBadge: 'Shift ended · count pending',
    shiftOpenHint: (staffName: string, since: string) =>
      `Shift OPEN · ${staffName} since ${since}. Close it from the desk to count the cash.`,
  },

  /** Home cockpit: four metric tiles plus two read-only monitors. */
  home: {
    bankUpi: 'Bank UPI / Online',
    cashDrawer: 'Cash in Drawer',
    collectedBy: (staffName: string) => `Collected by ${staffName}`,
    expensesEmpty: '✓ No expenses logged today',
    expensesTitle: "Today's Cash Out / Expenses",
    loggedBy: (staffName: string) => `Logged by ${staffName}`,
    pendingDues: 'Total Pending Dues',
    recentEmpty: 'No collections recorded yet today',
    recentTitle: 'Recent Collections Today',
    totalRevenue: 'Total Revenue Today',
    viewShiftLog: 'View all collections in Shift log →',
  },

  /** Staff & shifts. */
  staff: {
    activeShift: 'Active desk shift',
    addStaff: '+ Add Staff Member',
    cashInShift: 'Cash collected',
    directory: 'Staff Directory',
    inactive: 'Inactive',
    modalCancel: 'Cancel',
    modalName: 'Full name',
    modalPasscode: 'Login passcode',
    modalPasscodeHint: 'At least 8 characters. Share it with the staff member directly.',
    modalPhone: 'Phone number',
    modalRole: 'Role',
    modalSave: 'Create Staff Account',
    modalSaving: 'Creating…',
    modalTitle: 'Add a staff member',
    noShift: 'No desk shift is open right now.',
    since: (time: string) => `since ${time}`,
    statusActive: 'Active',
  },

  /** Master pricing controller. */
  plans: {
    active: 'Active',
    addPlan: '+ Add Plan',
    deactivate: 'Deactivate',
    duration: 'Duration',
    durationMonths: (months: number) => `${months} month${months === 1 ? '' : 's'}`,
    edit: 'Edit',
    editTitle: 'Edit plan',
    empty: 'No plans yet. Add one so reception can sell it.',
    fee: 'Fee',
    inactive: 'Inactive',
    modalCancel: 'Cancel',
    modalDuration: 'Duration (months)',
    modalName: 'Plan name',
    modalPrice: 'Fee (₹)',
    modalSave: 'Save plan',
    modalSaving: 'Saving…',
    newTitle: 'Add a plan',
    planName: 'Plan',
    reactivate: 'Reactivate',
    subtitle: 'These rates appear in reception’s plan selector the moment you save.',
    title: 'Membership Plans',
  },

  /** Secondary pages: full dues ledger, shifts, expenses, settings, bill check. */
  pages: {
    dues: {
      callBackHeading: (count: number) => `Old members — call them back (${count})`,
      empty: 'No pending dues. Everyone has paid.',
      heading: 'Fees Pending',
      listHeading: (count: number) => `Fees pending (${count})`,
      noCallBacks: 'No old members to call back.',
      noPhone: 'No phone',
      offerCta: 'Send Offer',
      subtitle: 'Every member who still owes money, and old members worth calling back.',
      totalLabel: 'Total pending',
    },
    expenses: {
      heading: 'Expenses to Check',
      subtitle: 'Check every rupee that left the drawer before it counts as spent.',
      waitingLabel: 'Waiting for you',
    },
    shifts: {
      closedHeading: (count: number) => `Closed Shifts (${count})`,
      heading: 'Drawer & Shifts',
      lockWarning: 'Locking is permanent. Nothing in this shift can be edited afterwards.',
      notCounted: 'Cash not counted yet',
      noClosed: 'No closed shifts yet.',
      noPending: 'No shifts waiting to be counted.',
      pendingHeading: (count: number) => `Shift Ended — Count Pending (${count})`,
      subtitle: 'Count the cash in the drawer and match it with the system before locking a shift.',
    },
    settings: {
      address: 'Registered address',
      brandingSubtitle: 'Identity and receipt details shown to members on every digital receipt.',
      receiptHint: 'These appear on digital receipts and due reminders sent to members.',
      receiptPreferences: 'Receipt preferences',
      supportPhone: 'Support phone',
    },
    trainers: {
      blocked: 'Login blocked',
      heading: 'Trainers & Payroll',
      mtdRevenue: 'MTD revenue',
      noTrainers: 'No trainers on the roster yet.',
      otherStaff: (count: number) => `Other staff (${count})`,
      paidToDate: 'Paid to date',
      payableNow: 'Payable now',
      paymentMode: 'Payment mode',
      ptClients: 'PT clients',
      blockWarning:
        'They will not be able to log in to GymOS any more. Everything they already recorded stays saved.',
      referenceNote: 'Reference note',
      referenceNoteOptional: '(optional)',
      subtitle: 'PT performance, commission owed, and who can log in at the counter.',
      totalPayable: 'Total payable',
      trainersHeading: (count: number) => `Trainers (${count})`,
    },
    verifyBill: {
      amountReceived: 'Amount received',
      heading: 'Verify Member Bill / Receipt',
      issuedAt: 'Issued at',
      issuedBy: 'Issued by',
      inputHint: 'Case-insensitive. Paste directly from a member’s shared receipt.',
      inputLabel: 'Receipt number or security code',
      notFound:
        'No matching record exists in this gym’s ledger. Do not accept this receipt as proof of ' +
        'payment — it may be edited, screenshotted from another gym, or entirely fabricated.',
      securityCode: 'Security code',
      subtitle: 'Confirm a receipt against the live ledger before honouring it.',
      shiftStatus: 'Shift status',
    },
  },

  /** Shared. */
  common: {
    cancel: 'Cancel',
    networkError: 'Could not reach the server. Please try again.',
    required: '*',
  },
} as const;

export type OwnerCopy = typeof ownerCopy;

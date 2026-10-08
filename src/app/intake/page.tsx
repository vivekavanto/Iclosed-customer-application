"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Home, Briefcase, FileText } from "lucide-react";
import HorizontalProgress, {
  Step,
  StepStatus,
} from "@/components/intake/HorizontalProgress";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { Step1 } from "@/components/intake/Step1";
import Step2 from "@/components/intake/Step2";
import Step4 from "@/components/intake/Step4";
import Step5Contact, {
  CoPersonCard,
  ContactInfo,
  AppliedReferral,
  ReferralAgentInfo,
} from "@/components/intake/Step5Contact";
import { INTAKE_STEPS } from "@/components/intake/steps";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { BLOB_ACCESS } from "@/lib/blobPrivacy";
import { useToast } from "@/components/ui/Toast";
import {
  EMPTY_EXTRACTION_STATE,
  mergeApsExtractions,
  type ApsExtractionResult,
  type ApsExtractionState,
  type ApsSide,
} from "@/lib/apsExtraction";
import {
  accountIsAParty,
  agentForSide,
  buildPrefillEntries,
  keysForSide,
  partiesForSide,
  splitPrimaryParty,
  type ApsAgentDetails,
  type PrefillKey,
} from "@/lib/apsPrefill";
import { createBrowserClient } from "@supabase/ssr";
import { resetUser } from "@/lib/analytics";
import { endClientSession } from "@/lib/sessionClient";
import { ENFORCE_APS_NAME_MATCH } from "@/lib/featureFlags";

/** An APS file already written to Blob, waiting for a lead to attach it to. */
interface ApsBlob {
  side: ApsSide;
  url: string;
  fileName: string;
}

/**
 * The CO-parties read off an agreement — everyone named on it except the first,
 * who is the client the file is being opened for. Offered as co-person cards on
 * the contact step.
 */
export interface ApsParties {
  purchaser: string[];
  seller: string[];
}

/** How many documents we'll read per side before the rest just ride along. */
const MAX_READS_PER_SIDE = 6;

/**
 * Shown when an agreement couldn't be read. Deliberately flat: the form works
 * either way, and the thing a client actually worries about at this point is
 * whether their upload was lost, so the copy says it wasn't.
 */
const READ_FAILED_MESSAGE =
  "We couldn't read your agreement automatically. You can enter the details yourself — your file is still saved with your submission.";

/**
 * How hard the page tries before it says that.
 *
 * Nothing waits on an extraction — it runs behind the client while they fill
 * the form in — so repeating costs them nothing, and the failures worth
 * repeating over (an overloaded model tier, a rate-limited minute) are the ones
 * that clear on their own. The wall clock is what stops it: a read still going
 * after this long has stopped being background work.
 */
// Ride out Gemini "high demand" 503s.
const READ_MAX_PASSES = 7;
const READ_PASS_BACKOFF_MS = [3_000, 8_000, 15_000, 20_000, 30_000, 40_000];
const READ_TOTAL_BUDGET_MS = 6 * 60 * 1000;

export default function ServiceSelection() {
  const [selected, setSelected] = useState<string | null>("closing");
  const [selectedClosingOption, setSelectedClosingOption] = useState<
    string | null
  >(null);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  // Filled from the APS read.
  const [depositAmount, setDepositAmount] = useState("");
  const [propertyType, setPropertyType] = useState("");
  // Closing (completion) date — on the APS, so it prefills from an upload.
  // Optional: an unsigned client won't know it yet. ISO "YYYY-MM-DD".
  const [closingDate, setClosingDate] = useState("");
  const [sellingClosingDate, setSellingClosingDate] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [step, setStep] = useState(1);
  const [purchaseFiles, setPurchaseFiles] = useState<File[]>([]);
  const [saleFiles, setSaleFiles] = useState<File[]>([]);

  // Step 2 no longer asks "have you signed the APS?" — it just asks for the
  // document. An uploaded agreement is the answer; no upload leaves it unknown,
  // which the API stores as null rather than a "no" nobody said.
  const apsPurchaseSigned: "yes" | null = purchaseFiles.length > 0 ? "yes" : null;
  const apsSaleSigned: "yes" | null = saleFiles.length > 0 ? "yes" : null;

  // Derived for back-compat with Step1/Step2/Step5Contact, which still expect a
  // single agreementSigned signal. "yes" if any active side is signed.
  const agreementSigned: "yes" | "no" | null =
    apsPurchaseSigned === "yes" || apsSaleSigned === "yes" ? "yes" : null;
  const setAgreementSigned = (v: "yes" | "no" | null) => {
    if (v === null) {
      setPurchaseFiles([]);
      setSaleFiles([]);
    }
  };

  // The signed-in account's name — held to answer ONE question, and nothing is
  // ever prefilled from it: is the person at the keyboard named on the
  // agreement they just uploaded?
  //
  // Who the parties are is a question the DOCUMENT answers, so the form fills
  // itself the same whether anyone is signed in or not. But a visitor signed in
  // as one person while filing another person's agreement is a session that
  // should not still be open, so it is closed — out loud, see
  // signOutForWrongParty() below.
  // Held in a ref as well as state so applyExtraction can read the latest name
  // without being re-created — and therefore re-running — when it arrives. The
  // two are written together, never separately.
  const [accountName, setAccountName] = useState("");
  const accountNameRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return;
        const me = await res.json();
        const name = [me?.user?.first_name, me?.user?.last_name]
          .filter(Boolean)
          .join(" ")
          .trim();
        if (!cancelled && name) {
          accountNameRef.current = name;
          setAccountName(name);
        }
      } catch {
        // Signed out, or /api/auth/me is unreachable. Either way there is no
        // name to check against and the intake carries on exactly as it would.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Step 4 (Contact) state lives here so values survive when the user clicks
  // Back to step 3 and returns. Step5Contact owns only its validation UI state.
  const [contactInfo, setContactInfo] = useState<ContactInfo>({
    fullName: "",
    email: "",
    phone: "",
  });
  const [coPurchaserCards, setCoPurchaserCards] = useState<CoPersonCard[]>([]);
  const [coSellerCards, setCoSellerCards] = useState<CoPersonCard[]>([]);
  const [referralSource, setReferralSource] = useState("");
  const [referralOther, setReferralOther] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [appliedReferral, setAppliedReferral] = useState<AppliedReferral | null>(null);
  const [referralNoCode, setReferralNoCode] = useState(false);
  const [referralAgent, setReferralAgent] = useState<ReferralAgentInfo>({
    name: "",
    company: "",
    email: "",
    phone: "",
    partnerId: null,
  });
  const [documentUploadChoice, setDocumentUploadChoice] = useState("");

  // ── APS upload & extraction ────────────────────────────────
  // Files now reach Blob at step 2, before any lead exists, so their contents
  // can prefill steps 3 and 4. They're namespaced under a per-page draft id;
  // the lead-scoped metadata rows are still written at submit.
  const draftIdRef = useRef<string | null>(null);
  const getDraftId = () => {
    // Generated lazily inside an event handler, never during render — a
    // randomUUID() in a lazy useState initializer would differ between the
    // server and client renders and trip hydration.
    if (!draftIdRef.current) draftIdRef.current = crypto.randomUUID();
    return draftIdRef.current;
  };

  const [apsBlobs, setApsBlobs] = useState<ApsBlob[]>([]);
  const [extraction, setExtraction] = useState<Record<ApsSide, ApsExtractionState>>({
    purchase: EMPTY_EXTRACTION_STATE,
    sale: EMPTY_EXTRACTION_STATE,
  });
  // Every document read for a side, in upload order, with the file it came
  // from. The form is filled from these MERGED — an agreement and the
  // amendments that changed it are one package, and reading only the first
  // file meant an amended price, or a purchaser added by amendment, never
  // reached the form at all. See mergeApsExtractions().
  const readResultsRef = useRef<
    Record<ApsSide, Array<{ fileName: string; result: ApsExtractionResult }>>
  >({ purchase: [], sale: [] });
  // Reads run one at a time per side, so a package of files queues behind
  // itself rather than firing four model calls at once.
  const readQueueRef = useRef<Record<ApsSide, Promise<void>>>({
    purchase: Promise.resolve(),
    sale: Promise.resolve(),
  });
  // Files whose read failed, kept so "Try again" doesn't make the client
  // upload the package a second time.
  const failedReadsRef = useRef<
    Record<ApsSide, Array<{ url: string; fileName: string }>>
  >({ purchase: [], sale: [] });
  // Every file handed to the queue, whether or not it has been read yet — what
  // the per-side cap counts. Counting finished reads instead would let a client
  // who drops ten files at once queue all ten before the first one lands.
  const queuedReadsRef = useRef<Record<ApsSide, Set<string>>>({
    purchase: new Set(),
    sale: new Set(),
  });

  // Fields the client has edited themselves. A read that lands afterwards must
  // never overwrite these — this is what makes background extraction safe when
  // the client clicks Continue before the read finishes.
  const touchedRef = useRef<Set<PrefillKey>>(new Set());
  const [apsParties, setApsParties] = useState<ApsParties>({ purchaser: [], seller: [] });
  // The first party named on the client's own side of the agreement — the
  // person this file is being opened for, so their name goes in "Your
  // Information" and everyone after them becomes a co-party card.
  const [apsPrimaryName, setApsPrimaryName] = useState<string | null>(null);
  const [apsAgent, setApsAgent] = useState<ApsAgentDetails | null>(null);

  // The agreement names somebody else. Drives the modal that says so — this
  // must never happen silently — and the sign-out happens when it is dismissed.
  const [signedOutNotice, setSignedOutNotice] = useState<{
    names: string[];
    accountName: string;
  } | null>(null);
  const signOutStartedRef = useRef(false);

  /** Raise the notice. The sign-out itself waits for the client to acknowledge it. */
  const signOutForWrongParty = useCallback(
    (names: string[], name: string) => {
      if (signOutStartedRef.current) return;
      signOutStartedRef.current = true;
      setSignedOutNotice({ names, accountName: name });
    },
    [],
  );

  /**
   * End the session, once the client has read why, and send them to the login
   * page.
   *
   * The redirect is the point: signing out in place changed nothing a person
   * could see — /intake carries no header, so the page sat there looking as if
   * the button had done nothing at all. Landing on /login is unambiguous, and
   * it is also where they need to be to come back as the right person.
   *
   * The intake in progress goes with it. Anything already uploaded is safe in
   * Blob, but the form is not carried across.
   */
  const [signingOut, setSigningOut] = useState(false);

  const confirmSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      await supabase.auth.signOut();
    } catch {}
    // The idle/session clocks go too. Left behind, the NEXT login reads an
    // hours-old activity stamp and expires itself immediately.
    endClientSession();
    resetUser();
    accountNameRef.current = "";

    // A full navigation, not router.push: the session cookies have just been
    // cleared and every cached client-side view of them has to go with them.
    window.location.href = "/login";
  }, [signingOut]);

  const router = useRouter();
  const { error: toastError } = useToast();

  const getStatus = (currentStep: number, stepId: number): StepStatus => {
    return currentStep === stepId
      ? "current"
      : currentStep > stepId
        ? "complete"
        : "upcoming";
  };

  const [addressData, setAddressData] = useState({
    street: "",
    unit: "",
    city: "",
    postalCode: "",
  });

  const [sellingAddressData, setSellingAddressData] = useState({
    street: "",
    unit: "",
    city: "",
    postalCode: "",
  });

  // ── Prefill plumbing ───────────────────────────────────────

  /** Write a single read value into the field it belongs to. */
  const setPrefillField = useCallback((key: PrefillKey, value: string) => {
    switch (key) {
      case "purchasePrice":
        setPurchasePrice(value);
        break;
      case "sellingPrice":
        setSellingPrice(value);
        break;
      case "depositAmount":
        setDepositAmount(value);
        break;
      case "closingDate":
        setClosingDate(value);
        break;
      case "sellingClosingDate":
        setSellingClosingDate(value);
        break;
      case "address.street":
        setAddressData((prev) => ({ ...prev, street: value }));
        break;
      case "address.unit":
        setAddressData((prev) => ({ ...prev, unit: value }));
        break;
      case "address.city":
        setAddressData((prev) => ({ ...prev, city: value }));
        break;
      case "address.postalCode":
        setAddressData((prev) => ({ ...prev, postalCode: value }));
        break;
      case "sellingAddress.street":
        setSellingAddressData((prev) => ({ ...prev, street: value }));
        break;
      case "sellingAddress.unit":
        setSellingAddressData((prev) => ({ ...prev, unit: value }));
        break;
      case "sellingAddress.city":
        setSellingAddressData((prev) => ({ ...prev, city: value }));
        break;
      case "sellingAddress.postalCode":
        setSellingAddressData((prev) => ({ ...prev, postalCode: value }));
        break;
    }
  }, []);

  /** Step2 calls this on every edit. Once touched, a field is the client's. */
  const markFieldTouched = useCallback((key: PrefillKey) => {
    touchedRef.current.add(key);
  }, []);

  /**
   * Fill the form from everything read for this side.
   *
   * Called with the MERGED result each time a document finishes reading, so
   * the form always shows the package as it currently stands — an amendment
   * that lands after the agreement moves the price to the amended one rather
   * than leaving whichever value happened to be read first.
   *
   * A key the merged read has nothing for is cleared, not left behind: that is
   * what makes re-applying after a file is removed correct. Fields the client
   * has edited are never touched, either way.
   */
  const applyExtraction = useCallback(
    (side: ApsSide, result: ApsExtractionResult) => {
      const entries = buildPrefillEntries(result, side, selectedClosingOption);
      const values = new Map(entries.map((e) => [e.key, e.value]));

      // Everything the read found goes in. Confidence is still recorded with
      // the submission for our own audit, but it no longer decides whether the
      // client sees the value: a figure we read as "medium" is still the figure
      // printed on their agreement, and offering it as a suggestion to accept
      // only asked them to do the typing we had already done for them.
      for (const key of keysForSide(side, selectedClosingOption)) {
        // The APS deposit beats a typed one.
        const apsDeposit = key === "depositAmount" && values.has(key);
        if (touchedRef.current.has(key) && !apsDeposit) continue;
        setPrefillField(key, values.get(key) ?? "");
      }

      // The first party on the client's side of the agreement is the client;
      // everyone after them is a co-party. No account is consulted — see the
      // note on splitPrimaryParty().
      const { role, names } = partiesForSide(result, side);
      const { primary, others } = splitPrimaryParty(names);
      setApsParties((prev) => ({ ...prev, [role]: others }));

      // In a Buy & Sell the client is the first party on BOTH agreements, so
      // the purchase side names them and the sale side would only repeat it.
      const primarySide: ApsSide =
        selectedClosingOption === "selling" ? "sale" : "purchase";
      if (primary && side === primarySide) setApsPrimaryName(primary);

      // First agreement to name an agent wins; a second one doesn't overwrite.
      const agent = agentForSide(result, side);
      if (agent) setApsAgent((prev) => prev ?? agent);
    },
    [selectedClosingOption, setPrefillField],
  );

  /**
   * Re-fill a side from every document still uploaded under it.
   *
   * The single path by which reads reach the form: one document or six, added
   * or removed, it always ends up applying the merge of what is currently
   * there.
   */
  const applySideResults = useCallback(
    (side: ApsSide) => {
      const reads = readResultsRef.current[side];
      if (reads.length === 0) return;

      const merged = mergeApsExtractions(reads.map((r) => r.result));
      setExtraction((prev) => ({
        ...prev,
        [side]: {
          status: "done",
          // Names the agreement itself, not the last amendment read — this is
          // what the status line and the stored audit record point at.
          fileName: reads[0].fileName,
          result: merged,
          error: null,
        },
      }));
      applyExtraction(side, merged);
    },
    [applyExtraction],
  );

  /**
   * Is the signed-in visitor named on this side's agreement — and if not, end
   * their session.
   *
   * Asked only once every document queued for the side has come back, read or
   * failed. Mid-package is the wrong moment: an amendment on its own names just
   * the party it adds, so a client who IS on the agreement would be signed out
   * over the file that happened to be read first.
   *
   * accountIsAParty() answers true whenever there is nothing to go on — nobody
   * signed in, or a read that produced no names — so a poor read can never cost
   * anyone their session.
   */
  const checkAccountOnSide = useCallback(
    (side: ApsSide) => {
      const account = accountNameRef.current.trim();
      if (!ENFORCE_APS_NAME_MATCH || !account || signOutStartedRef.current) return;

      const reads = readResultsRef.current[side];
      const settled =
        queuedReadsRef.current[side].size ===
        reads.length + failedReadsRef.current[side].length;
      if (!settled || reads.length === 0) return;

      const merged = mergeApsExtractions(reads.map((r) => r.result));
      if (!merged.is_aps) return;

      const { names } = partiesForSide(merged, side);
      if (!accountIsAParty(names, account)) {
        signOutForWrongParty(names, account);
      }
    },
    [signOutForWrongParty],
  );

  // Run the check on anything read before /api/auth/me answered. Without this,
  // uploading fast enough on a slow page load would slip past it entirely.
  useEffect(() => {
    if (!accountName.trim()) return;
    checkAccountOnSide("purchase");
    checkAccountOnSide("sale");
  }, [accountName, checkAccountOnSide]);

  /** Undo everything an agreement on this side filled in, sparing client edits. */
  const clearSidePrefill = useCallback(
    (side: ApsSide) => {
      for (const key of keysForSide(side, selectedClosingOption)) {
        if (touchedRef.current.has(key)) continue;
        setPrefillField(key, "");
      }

      setApsParties((prev) => ({
        ...prev,
        [side === "sale" ? "seller" : "purchaser"]: [],
      }));
      setApsPrimaryName(null);
      setApsAgent(null);
      setExtraction((prev) => ({ ...prev, [side]: EMPTY_EXTRACTION_STATE }));
      readResultsRef.current[side] = [];
      failedReadsRef.current[side] = [];
      queuedReadsRef.current[side] = new Set();
    },
    [selectedClosingOption, setPrefillField],
  );

  // ── Upload & read, at step 2 ───────────────────────────────

  /**
   * Read one uploaded document and fold it into its side.
   *
   * Every file in the package gets its own read: an amendment is a separate
   * document that says separate things, and asking a single call to reason
   * across a stack of PDFs reads them all worse than reading each on its own.
   */
  const readAgreement = useCallback(
    async (side: ApsSide, fileUrl: string, fileName: string) => {
      setExtraction((prev) => ({
        ...prev,
        [side]: {
          status: "reading",
          // Keep naming the agreement while an amendment behind it is read.
          fileName: prev[side].result ? prev[side].fileName : fileName,
          result: prev[side].result,
          error: null,
        },
      }));

      // The route walks a ladder of models before it reports a failure, so one
      // failed pass means every tier was slow, overloaded or rate-limited at the
      // same moment. That is exactly the kind of thing that clears on its own,
      // so the page simply goes round again rather than handing the client an
      // error to deal with. The status line stays on "reading" throughout —
      // from where they're sitting it's still working, because it is.
      //
      // Bounded by a wall clock as well as a pass count: a client who reaches
      // the contact step should not still have a spinner running behind them.
      let lastError = READ_FAILED_MESSAGE;
      const giveUpAt = Date.now() + READ_TOTAL_BUDGET_MS;

      for (let pass = 1; pass <= READ_MAX_PASSES; pass++) {
        try {
          const res = await fetch("/api/intake/extract-aps", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file_url: fileUrl, side, file_name: fileName }),
          });
          const data = await res.json().catch(() => null);

          if (data?.success && data?.result) {
            readResultsRef.current[side] = [
              ...readResultsRef.current[side].filter((r) => r.fileName !== fileName),
              { fileName, result: data.result as ApsExtractionResult },
            ];
            failedReadsRef.current[side] = failedReadsRef.current[side].filter(
              (f) => f.fileName !== fileName,
            );
            applySideResults(side);
            checkAccountOnSide(side);
            return;
          }

          if (typeof data?.error === "string" && data.error) lastError = data.error;

          // 415 is a verdict on the file itself and 429 means we're already
          // asking too often — going round again would only make both worse.
          if (res.status === 415 || res.status === 429) break;
        } catch (err) {
          console.error(`[intake] APS read failed (${side}, pass ${pass}):`, err);
        }

        const backoff = READ_PASS_BACKOFF_MS[pass - 1] ?? 0;
        if (pass === READ_MAX_PASSES || Date.now() + backoff >= giveUpAt) break;
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }

      // Kept so "Try again" doesn't make the client upload the file twice.
      failedReadsRef.current[side] = [
        ...failedReadsRef.current[side].filter((f) => f.fileName !== fileName),
        { url: fileUrl, fileName },
      ];

      // A failed read is not an error the client has to deal with — the form
      // still works, they just fill it in themselves. And one file failing out
      // of several never discards what the others already gave us.
      setExtraction((prev) => ({
        ...prev,
        [side]: {
          status: "error",
          fileName: prev[side].result ? prev[side].fileName : fileName,
          result: prev[side].result,
          error: lastError,
        },
      }));

      // The file that just failed may have been the last one outstanding, and
      // the package is only judged once nothing is still in flight.
      checkAccountOnSide(side);
    },
    [applySideResults, checkAccountOnSide],
  );

  /** Queue a read behind whatever this side is already reading. */
  const queueRead = useCallback(
    (side: ApsSide, fileUrl: string, fileName: string) => {
      queuedReadsRef.current[side].add(fileName);
      const next = readQueueRef.current[side].then(() =>
        readAgreement(side, fileUrl, fileName),
      );
      readQueueRef.current[side] = next.catch(() => {});
      return next;
    },
    [readAgreement],
  );

  /**
   * Read the documents whose reads failed, at the client's request.
   *
   * The blobs are already uploaded, so this costs them nothing but the wait —
   * and a read that ran out of time on a forty-page scan often lands on a
   * second pass, because the route drops to a lighter model once it retries.
   */
  const retryRead = useCallback(
    (side: ApsSide) => {
      const targets = failedReadsRef.current[side];
      if (targets.length === 0) return;
      failedReadsRef.current[side] = [];
      for (const target of targets) {
        void queueRead(side, target.url, target.fileName);
      }
    },
    [queueRead],
  );

  const handleApsFilesAdded = useCallback(
    async (side: ApsSide, files: File[]) => {
      const draftId = getDraftId();

      for (const file of files) {
        setExtraction((prev) => ({
          ...prev,
          [side]: {
            status: "uploading",
            // Keep any result already read from an earlier file on this side —
            // uploading an amendment shouldn't blank what the agreement gave
            // us, and fileName has to keep naming the agreement or the stored
            // audit record points at the wrong document.
            fileName: prev[side].result ? prev[side].fileName : file.name,
            result: prev[side].result,
            error: null,
          },
        }));

        try {
          const blob = await upload(
            `corporate-docs/pending/${draftId}/${Date.now()}-${file.name}`,
            file,
            {
              access: BLOB_ACCESS,
              handleUploadUrl: "/api/blob/aps-upload",
              clientPayload: JSON.stringify({
                draft_id: draftId,
                doc_type: side === "sale" ? "aps_sale" : "aps_purchase",
              }),
            },
          );

          setApsBlobs((prev) => [
            ...prev,
            { side, url: blob.url, fileName: file.name },
          ]);

          // Every document in the package is read and merged. The cap is an
          // abuse brake, not a product decision — past it the files still go
          // with the submission for our team to read.
          if (queuedReadsRef.current[side].size < MAX_READS_PER_SIDE) {
            void queueRead(side, blob.url, file.name);
          } else {
            setExtraction((prev) => ({
              ...prev,
              [side]: { ...prev[side], status: prev[side].result ? "done" : "idle" },
            }));
          }
        } catch (err) {
          console.error(`[intake] APS upload failed (${side}):`, err);
          setExtraction((prev) => ({
            ...prev,
            [side]: {
              status: "error",
              fileName: file.name,
              result: prev[side].result,
              error: "That file couldn't be uploaded. Please try again.",
            },
          }));
        }
      }
    },
    [queueRead],
  );

  const handleApsFileRemoved = useCallback(
    (side: ApsSide, file: File) => {
      setApsBlobs((prev) => {
        // Drop the first blob recorded under this name — files are appended in
        // pick order, so the first match is the one being removed.
        const index = prev.findIndex(
          (b) => b.side === side && b.fileName === file.name,
        );
        if (index === -1) return prev;
        return [...prev.slice(0, index), ...prev.slice(index + 1)];
      });

      readResultsRef.current[side] = readResultsRef.current[side].filter(
        (r) => r.fileName !== file.name,
      );
      failedReadsRef.current[side] = failedReadsRef.current[side].filter(
        (f) => f.fileName !== file.name,
      );
      queuedReadsRef.current[side].delete(file.name);

      // Re-fill from what's left, so removing an amendment takes its changes
      // back out without disturbing what the agreement itself said.
      if (readResultsRef.current[side].length === 0) clearSidePrefill(side);
      else applySideResults(side);
    },
    [clearSidePrefill, applySideResults],
  );

  const services = [
    {
      id: "closing",
      title: "Property Closing",
      description:
        "Buying or selling a property? We'll guide you through the legal process—start to finish, and beyond.",
      icon: Home,
    },
    {
      id: "refinance",
      title: "Mortgage Refinance",
      description:
        "Changing your current mortgage? Count on us to handle the legal side, smoothly and efficiently.",
      icon: Briefcase,
    },
    {
      id: "condo",
      title: "Condo Status Certificate Report",
      description:
        "Closing on a condo? We'll review your status certificate thoroughly—at no extra charge.",
      icon: FileText,
    },
  ];

  // Only Property Closing is offered right now. The others stay defined, and the
  // API still maps their ids, so re-enabling one means adding it back here.
  const OFFERED_SERVICE_IDS = ["closing"];
  const offeredServices = services.filter((s) =>
    OFFERED_SERVICE_IDS.includes(s.id),
  );

  const progressSteps: Step[] = INTAKE_STEPS.map((s) => ({
    id: s.id,
    label: s.label,
    status: getStatus(step, s.id),
  }));

  const resetForm = () => {
    setStep(1);
    setSelected("closing");
    setSelectedClosingOption(null);
    setPurchasePrice("");
    setSellingPrice("");
    setDepositAmount("");
    setPropertyType("");
    setClosingDate("");
    setSellingClosingDate("");
    setPurchaseFiles([]);
    setSaleFiles([]);
    setAddressData({
      street: "",
      unit: "",
      city: "",
      postalCode: "",
    });
    setSellingAddressData({
      street: "",
      unit: "",
      city: "",
      postalCode: "",
    });
    setContactInfo({ fullName: "", email: "", phone: "" });
    setCoPurchaserCards([]);
    setCoSellerCards([]);
    setReferralSource("");
    setReferralOther("");
    setDocumentUploadChoice("");
    setReferralCode("");
    setAppliedReferral(null);
    setReferralNoCode(false);
    setReferralAgent({ name: "", company: "", email: "", phone: "", partnerId: null });

    // APS upload / extraction
    setApsBlobs([]);
    setExtraction({ purchase: EMPTY_EXTRACTION_STATE, sale: EMPTY_EXTRACTION_STATE });
    setApsParties({ purchaser: [], seller: [] });
    setApsPrimaryName(null);
    setApsAgent(null);
    touchedRef.current = new Set();
    readResultsRef.current = { purchase: [], sale: [] };
    failedReadsRef.current = { purchase: [], sale: [] };
    queuedReadsRef.current = { purchase: new Set(), sale: new Set() };
    readQueueRef.current = { purchase: Promise.resolve(), sale: Promise.resolve() };
    // The session stays ended — this only clears the notice about it, so a
    // second intake started from the success modal isn't greeted by the last
    // one's message.
    setSignedOutNotice(null);
    signOutStartedRef.current = false;
    // A fresh submission is a fresh draft — new blob namespace.
    draftIdRef.current = null;
  };

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <main className="flex-grow flex flex-col items-center px-8 ">
        {/* <div className="w-full max-w-7xl mb-8 ">
          <HorizontalProgress steps={progressSteps} />
        </div> */}

        {/* STEP 1 */}
        {step === 1 && (
          <Step1
            services={offeredServices}
            selected={selected}
            setSelected={setSelected}
            selectedClosingOption={selectedClosingOption}
            setSelectedClosingOption={setSelectedClosingOption}
            setStep={setStep}
            step={step}
            agreementSigned={agreementSigned}
          />
        )}

        {/* STEP 3 — Price & Address.
            Sits AFTER the agreement step so anything read off an uploaded APS
            can prefill these fields before the client ever sees them. */}
        {step === 3 && (
          <Step2
            purchasePrice={purchasePrice}
            setPurchasePrice={setPurchasePrice}
            sellingPrice={sellingPrice}
            setSellingPrice={setSellingPrice}
            propertyType={propertyType}
            setPropertyType={setPropertyType}
            closingDate={closingDate}
            setClosingDate={setClosingDate}
            sellingClosingDate={sellingClosingDate}
            setSellingClosingDate={setSellingClosingDate}
            onFieldTouched={markFieldTouched}
            formData={addressData}
            setFormData={setAddressData}
            sellingFormData={sellingAddressData}
            setSellingFormData={setSellingAddressData}
            selectedClosingOption={selectedClosingOption}
            setStep={setStep}
            step={step}
            agreementSigned={agreementSigned}
          />
        )}

        {/* STEP 2 — Agreement & Upload.
            Moved ahead of Price & Address: the APS is the document that holds
            the price, deposit, address and closing date, so it has to arrive
            before the fields it can answer. */}
        {step === 2 && (
          <Step4
            closingOption={selectedClosingOption as "buying" | "selling" | "both" | null}
            purchaseFiles={purchaseFiles}
            setPurchaseFiles={setPurchaseFiles}
            saleFiles={saleFiles}
            setSaleFiles={setSaleFiles}
            onFilesAdded={handleApsFilesAdded}
            onFileRemoved={handleApsFileRemoved}
            extraction={extraction}
            onRetryRead={retryRead}
            setStep={setStep}
            step={step}
          />
        )}

        {/* STEP 4 — Contact */}
        {step === 4 ? (
          <Step5Contact
            step={step}
            setStep={setStep}
            agreementSigned={agreementSigned}
            setAgreementSigned={setAgreementSigned}
            setShowSuccessModal={setShowSuccessModal}
            selectedClosingOption={selectedClosingOption}
            contactInfo={contactInfo}
            setContactInfo={setContactInfo}
            coPurchaserCards={coPurchaserCards}
            setCoPurchaserCards={setCoPurchaserCards}
            coSellerCards={coSellerCards}
            setCoSellerCards={setCoSellerCards}
            referralSource={referralSource}
            setReferralSource={setReferralSource}
            referralOther={referralOther}
            setReferralOther={setReferralOther}
            referralCode={referralCode}
            setReferralCode={setReferralCode}
            appliedReferral={appliedReferral}
            setAppliedReferral={setAppliedReferral}
            referralNoCode={referralNoCode}
            setReferralNoCode={setReferralNoCode}
            referralAgent={referralAgent}
            setReferralAgent={setReferralAgent}
            documentUploadChoice={documentUploadChoice}
            setDocumentUploadChoice={setDocumentUploadChoice}
            apsParties={apsParties}
            apsPrimaryName={apsPrimaryName}
            apsAgent={apsAgent}
            onComplete={async (contactData) => {
              try {
                const [firstName, ...rest] = contactData.fullName.split(" ");
                const lastName = rest.join(" ");

                const intakeResponse = await fetch("/api/intake", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    first_name: firstName,
                    last_name: lastName || "",
                    email: contactData.email,
                    phone: contactData.phone,

                    service: selected,
                    sub_service: selectedClosingOption,
                    price: purchasePrice,
                    selling_price: selectedClosingOption === "both" ? sellingPrice : null,
                    deposit_amount:
                      selectedClosingOption === "selling" ? null : depositAmount,
                    building_type:
                      selectedClosingOption === "selling" ? null : propertyType || null,
                    closing_date: closingDate,
                    selling_closing_date:
                      selectedClosingOption === "both" ? sellingClosingDate : null,

                    address_street: addressData.street,
                    address_unit: addressData.unit,
                    address_city: addressData.city,
                    address_postal_code: addressData.postalCode,
                    address_province: "Ontario",

                    ...(selectedClosingOption === "both" && {
                      selling_address_street: sellingAddressData.street,
                      selling_address_unit: sellingAddressData.unit,
                      selling_address_city: sellingAddressData.city,
                      selling_address_postal_code:
                        sellingAddressData.postalCode,
                      selling_address_province: "Ontario",
                    }),

                    // What the reader actually returned, kept alongside what the
                    // client accepted — the only way to tell a bad read from a
                    // deliberate correction after the fact.
                    aps_extraction: {
                      ...(extraction.purchase.result
                        ? {
                            purchase: {
                              file_name: extraction.purchase.fileName,
                              // Every document that fed the merge, and what each
                              // one said on its own. Without the per-file reads
                              // there is no telling afterwards whether a value
                              // came off the agreement or an amendment.
                              documents: readResultsRef.current.purchase.map((r) => ({
                                file_name: r.fileName,
                                document_type: r.result.document_type,
                                result: r.result,
                              })),
                              result: extraction.purchase.result,
                            },
                          }
                        : {}),
                      ...(extraction.sale.result
                        ? {
                            sale: {
                              file_name: extraction.sale.fileName,
                              documents: readResultsRef.current.sale.map((r) => ({
                                file_name: r.fileName,
                                document_type: r.result.document_type,
                                result: r.result,
                              })),
                              result: extraction.sale.result,
                            },
                          }
                        : {}),
                    },

                    aps_signed_purchase:
                      apsPurchaseSigned === null ? null : apsPurchaseSigned === "yes",
                    aps_signed_sale:
                      apsSaleSigned === null ? null : apsSaleSigned === "yes",
                    co_persons: contactData.coPersons ?? [],
                    document_upload_mode: contactData.documentUploadMode,
                    document_uploader_co_person_id: contactData.documentUploaderCoPersonId,
                    referral_source: contactData.referralSource || "",
                    partner_id: contactData.partnerId,
                    referral_agent_name: contactData.referralAgentName || "",
                    referral_agent_company: contactData.referralAgentCompany || "",
                    referral_agent_email: contactData.referralAgentEmail || "",
                    referral_agent_phone: contactData.referralAgentPhone || "",
                  }),
                });

                const intakeResult = await intakeResponse.json();

                if (!intakeResult.success) {
                  toastError(intakeResult.error || "Submission failed. Please try again.");
                  return;
                }

                const leadId = intakeResult.lead_id;

                // The files are already in Blob — they were uploaded at step 2
                // so their contents could prefill this form. All that's left is
                // to attach them to the lead that now exists.
                const attachable = apsBlobs.filter((b) =>
                  b.side === "sale"
                    ? apsSaleSigned === "yes"
                    : apsPurchaseSigned === "yes",
                );

                for (const b of attachable) {
                  try {
                    const docType = b.side === "sale" ? "aps_sale" : "aps_purchase";

                    const metadataResponse = await fetch(
                      "/api/intake/save-aps-metadata",
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          lead_id: leadId,
                          doc_type: docType,
                          file_name: b.fileName,
                          file_url: b.url,
                        }),
                      }
                    );

                    const metadataResult = await metadataResponse.json();
                    if (!metadataResult.success) {
                      console.error(`Metadata save failed (${b.side}):`, metadataResult.error);
                      continue;
                    }

                    await fetch("/api/intake/mark-aps-uploaded", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ lead_id: leadId, side: b.side }),
                    });
                  } catch (err) {
                    console.error(`Attaching APS failed (${b.side}):`, err);
                  }
                }

                // 3️⃣ Success
                setShowSuccessModal(true);
              } catch (error) {
                console.error("Submission failed:", error);
              }
            }}
          />
        ) : null}

        {/* The agreement names someone other than the signed-in account.
            Dismissing this is what signs them out — including via the X, so
            there is no way to be told and stay signed in anyway. */}
        <Modal
          open={signedOutNotice !== null}
          onClose={() => void confirmSignOut()}
          title="Name doesn't match"
          size="md"
        >
          {signedOutNotice && (
            <div className="py-2">
              <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
                You&apos;re signed in as{" "}
                <strong className="text-gray-900">{signedOutNotice.accountName}</strong>,
                but the agreement names{" "}
                <strong className="text-gray-900">
                  {signedOutNotice.names.join(", ")}
                </strong>
                .
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-muted)]">
                We&apos;ll sign you out and take you to the login page. Start again
                with the correct details.
              </p>

              <div className="mt-6 flex justify-end">
                <Button
                  onClick={() => void confirmSignOut()}
                  loading={signingOut}
                  className="px-6 py-2.5 bg-[#C10007] text-white rounded-md hover:opacity-90 transition cursor-pointer"
                >
                  OK
                </Button>
              </div>
            </div>
          )}
        </Modal>

        <Modal
          open={showSuccessModal}
          onClose={() => setShowSuccessModal(false)}
          title="Submission Successful"
          size="md"
        >
          <div className="text-center py-8">
            <div className="flex justify-center mb-6">
              <div className="bg-[#FFE5E6] p-4 rounded-full">
                <svg
                  className="w-8 h-8 text-[#C10007]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            </div>

            <p className="text-[var(--color-text-muted)] mb-8">
              Your information has been successfully submitted. Our team will
              contact you shortly.
            </p>

            <Button
              onClick={() => {
                setShowSuccessModal(false);
                resetForm();
                router.push("/");
              }}
              className="px-8 py-3 bg-[#C10007] text-white rounded-md hover:opacity-90 transition cursor-pointer"
            >
              Done
            </Button>
          </div>
        </Modal>
      </main>
    </div>
  );
}

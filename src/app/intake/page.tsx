"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  type ApsExtractionResult,
  type ApsExtractionState,
  type ApsSide,
} from "@/lib/apsExtraction";
import {
  agentForSide,
  buildPrefillEntries,
  checkSelfOnAgreement,
  keysForSide,
  partiesForSide,
  type PrefillKey,
} from "@/lib/apsPrefill";

/** An APS file already written to Blob, waiting for a lead to attach it to. */
interface ApsBlob {
  side: ApsSide;
  url: string;
  fileName: string;
}

/** Names read off an agreement, offered as co-person cards on the contact step. */
export interface ApsParties {
  purchaser: string[];
  seller: string[];
}

/**
 * The signed-in client, matched to the party of the same name on an agreement.
 * Drives the confirmation line on the contact step and — the point of it —
 * keeps that party OUT of the co-person cards. An APS with two buyers names the
 * purchaser and ONE co-purchaser, never two co-purchasers.
 */
export interface ApsSelfMatch {
  role: "purchaser" | "seller";
  name: string;
}

/**
 * A blocking read outcome: the agreement doesn't name the signed-in client.
 * Held per side so a Buy & Sell can fail one agreement and keep the other.
 */
export interface ApsPartyMismatch {
  role: "purchaser" | "seller";
  /** The name we looked for — the signed-in account's. */
  selfName: string;
  /** The names the agreement gave for that role. */
  names: string[];
  /** They ARE on the document, just on the far side of the deal. */
  onOppositeSide: boolean;
}

export default function ServiceSelection() {
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedClosingOption, setSelectedClosingOption] = useState<
    string | null
  >(null);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  // Optional deposit held under the agreement — captured per property side.
  const [depositAmount, setDepositAmount] = useState("");
  const [sellingDepositAmount, setSellingDepositAmount] = useState("");
  // Closing (completion) date — on the APS, so it prefills from an upload.
  // Optional: an unsigned client won't know it yet. ISO "YYYY-MM-DD".
  const [closingDate, setClosingDate] = useState("");
  const [sellingClosingDate, setSellingClosingDate] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [step, setStep] = useState(1);
  const [apsPurchaseSigned, setApsPurchaseSigned] = useState<"yes" | "no" | null>(null);
  const [apsSaleSigned, setApsSaleSigned] = useState<"yes" | "no" | null>(null);
  const [purchaseFiles, setPurchaseFiles] = useState<File[]>([]);
  const [saleFiles, setSaleFiles] = useState<File[]>([]);

  // Derived for back-compat with Step1/Step2/Step5Contact, which still expect a
  // single agreementSigned signal. "yes" if any active side is signed.
  const agreementSigned: "yes" | "no" | null = (() => {
    const hasYes = apsPurchaseSigned === "yes" || apsSaleSigned === "yes";
    if (hasYes) return "yes";
    const hasNo = apsPurchaseSigned === "no" || apsSaleSigned === "no";
    if (hasNo) return "no";
    return null;
  })();
  const setAgreementSigned = (v: "yes" | "no" | null) => {
    if (v === null) {
      setApsPurchaseSigned(null);
      setApsSaleSigned(null);
    }
  };

  // Pre-fill contact info for logged-in users
  const [authProfile, setAuthProfile] = useState<{
    fullName: string;
    email: string;
    phone: string;
  } | undefined>(undefined);

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
  const authPrefillAppliedRef = useRef(false);

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
  // Only the first file per side is read. The upload also accepts amendments,
  // waivers and schedules, and merging those over the base agreement is a
  // follow-up — step 2 says as much on screen.
  const readSideRef = useRef<Record<ApsSide, boolean>>({ purchase: false, sale: false });
  // Which file each side's prefill actually came from, so removing an
  // amendment doesn't retract the agreement's values.
  const readSourceRef = useRef<Record<ApsSide, string | null>>({
    purchase: null,
    sale: null,
  });

  // Fields the client has edited themselves. A read that lands afterwards must
  // never overwrite these — this is what makes background extraction safe when
  // the client clicks Continue before the read finishes.
  const touchedRef = useRef<Set<PrefillKey>>(new Set());
  // Fields currently holding a read value, per side, so removing a file undoes
  // exactly what that file filled in.
  const [prefilled, setPrefilled] = useState<Record<ApsSide, PrefillKey[]>>({
    purchase: [],
    sale: [],
  });
  // Medium/low-confidence reads. Offered as a tap-to-accept suggestion rather
  // than written into the field.
  const [suggestions, setSuggestions] = useState<Partial<Record<PrefillKey, string>>>({});
  const [apsParties, setApsParties] = useState<ApsParties>({ purchaser: [], seller: [] });
  const [apsAgent, setApsAgent] = useState<{ name: string; company: string | null } | null>(null);
  // The party on each agreement that IS the signed-in client. Per side, because
  // a Buy & Sell client is the purchaser on one agreement and the seller on the
  // other. All-null is the logged-out case, where there's no name to match.
  const [apsSelfMatch, setApsSelfMatch] = useState<
    Record<ApsSide, ApsSelfMatch | null>
  >({ purchase: null, sale: null });
  // Per side: the agreement named other people, but not the signed-in client.
  // Blocks Continue on step 2 until the right document is uploaded.
  const [apsPartyMismatch, setApsPartyMismatch] = useState<
    Record<ApsSide, ApsPartyMismatch | null>
  >({ purchase: null, sale: null });

  // The signed-in client's name, as the APS gate looks for it. Held in a ref so
  // applyExtraction always sees the latest one without being re-created (and
  // re-running) every time the profile fetch settles.
  const selfNameRef = useRef<string>("");
  selfNameRef.current = authProfile?.fullName ?? "";
  // A read that finished before /api/auth/me did, parked here until there's a
  // name to check it against. Without this, uploading fast enough would slip
  // past the gate on a page load where the profile was slow.
  const pendingVerifyRef = useRef<Record<ApsSide, ApsExtractionResult | null>>({
    purchase: null,
    sale: null,
  });

  // One entry per agreement that named the client, for the confirmation lines
  // on the contact step. Buy & Sell yields two — purchaser and seller.
  const apsSelfMatches = useMemo(
    () => [apsSelfMatch.purchase, apsSelfMatch.sale].filter((m): m is ApsSelfMatch => m !== null),
    [apsSelfMatch],
  );

  // Flattened for the "from your agreement" markers — Step2 only cares whether
  // a field is prefilled, not which agreement filled it.
  const prefilledFieldSet = useMemo(
    () => new Set<PrefillKey>([...prefilled.purchase, ...prefilled.sale]),
    [prefilled],
  );

  const router = useRouter();
  const { error: toastError } = useToast();

  useEffect(() => {
    const loadAuthProfile = async () => {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      if (!meRes.ok) return;

      const me = await meRes.json();
      const email = me?.user?.email;
      if (!email) return;

      const res = await fetch("/api/deals", { cache: "no-store" });
      const data = res.ok ? await res.json() : null;
      const first = data?.deals?.[0];

      const serverName = [me.user.first_name, me.user.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

      setAuthProfile({
        fullName:
          serverName ||
          (first ? `${first.first_name ?? ""} ${first.last_name ?? ""}`.trim() : ""),
        email,
        phone: me.user.phone ?? first?.phone ?? "",
      });
    };
    loadAuthProfile();
  }, []);

  // Prefill contact form from the signed-in profile exactly once per page
  // load. Running this here (rather than inside Step5Contact) means the
  // prefill doesn't re-fire if the user navigates Back and forward again,
  // which would overwrite anything they had typed.
  useEffect(() => {
    if (authProfile && !authPrefillAppliedRef.current) {
      setContactInfo({
        fullName: authProfile.fullName,
        email: authProfile.email,
        phone: authProfile.phone,
      });
      authPrefillAppliedRef.current = true;
    }
  }, [authProfile]);

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
      case "sellingDepositAmount":
        setSellingDepositAmount(value);
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
    // A field the client has taken over no longer shows the "from your
    // agreement" marker, and its suggestion is no longer relevant.
    //
    // Both updaters return `prev` unchanged when there's nothing to drop —
    // this runs on every keystroke, and a fresh object each time would
    // re-render the whole step for no reason.
    setPrefilled((prev) => {
      if (!prev.purchase.includes(key) && !prev.sale.includes(key)) return prev;
      return {
        purchase: prev.purchase.filter((k) => k !== key),
        sale: prev.sale.filter((k) => k !== key),
      };
    });
    setSuggestions((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  /** Tap-to-accept for a medium/low-confidence read. */
  const acceptSuggestion = useCallback(
    (key: PrefillKey) => {
      const value = suggestions[key];
      if (!value) return;
      setPrefillField(key, value);
      // The client chose it, so it counts as theirs from here on.
      markFieldTouched(key);
    },
    [suggestions, setPrefillField, markFieldTouched],
  );

  /** Apply a completed read to the form. */
  const applyExtraction = useCallback(
    (side: ApsSide, result: ApsExtractionResult) => {
      // Who is the signed-in client on this agreement? Everything below hangs
      // off the answer: a document that doesn't name them is the wrong
      // document, and one that does tells us which party NOT to turn into a
      // co-person card.
      const check = checkSelfOnAgreement(result, side, selfNameRef.current);

      if (check.status === "mismatch") {
        // Refuse the agreement whole rather than half-filling the form from a
        // file that belongs to someone else. Step 2 blocks Continue on this.
        pendingVerifyRef.current[side] = null;
        setApsPartyMismatch((prev) => ({
          ...prev,
          [side]: {
            role: check.role,
            selfName: selfNameRef.current,
            names: check.names,
            onOppositeSide: check.onOppositeSide,
          },
        }));
        return;
      }

      // The read landed before /api/auth/me did, so there was no name to check
      // against. Hold the result for the effect below to re-check once the
      // profile arrives — otherwise a fast upload would skip the gate entirely.
      pendingVerifyRef.current[side] =
        check.status === "unverifiable" ? result : null;

      setApsPartyMismatch((prev) => (prev[side] ? { ...prev, [side]: null } : prev));

      const entries = buildPrefillEntries(result, side, selectedClosingOption);

      const appliedKeys: PrefillKey[] = [];
      const newSuggestions: Partial<Record<PrefillKey, string>> = {};

      for (const entry of entries) {
        // The guard that makes a late-arriving read safe.
        if (touchedRef.current.has(entry.key)) continue;

        if (entry.confidence === "high") {
          setPrefillField(entry.key, entry.value);
          appliedKeys.push(entry.key);
        } else {
          newSuggestions[entry.key] = entry.value;
        }
      }

      setPrefilled((prev) => ({ ...prev, [side]: appliedKeys }));
      setSuggestions((prev) => ({ ...prev, ...newSuggestions }));

      if (check.status === "match") {
        // N parties on the agreement means 1 client + N-1 co-parties. The
        // matched party is the client themselves, whose details are already
        // locked into the contact step from their account.
        setApsSelfMatch((prev) => ({
          ...prev,
          [side]: { role: check.role, name: check.self },
        }));
        setApsParties((prev) => ({ ...prev, [check.role]: check.others }));
      } else {
        // No signed-in name to match against (logged-out intake) or the read
        // found no parties at all. Seed every name and let the contact step
        // drop the one matching whatever the client types as their own.
        const { role, names } = partiesForSide(result, side);
        if (names.length > 0) {
          setApsParties((prev) => ({ ...prev, [role]: names }));
        }
      }

      // First agreement to name an agent wins; a second one doesn't overwrite.
      const agent = agentForSide(result, side);
      if (agent) setApsAgent((prev) => prev ?? agent);
    },
    [selectedClosingOption, setPrefillField],
  );

  // Re-run the party gate on any agreement that was read before the signed-in
  // profile arrived. Re-applying is safe: touchedRef still protects anything
  // the client has typed since.
  useEffect(() => {
    const name = authProfile?.fullName?.trim();
    if (!name) return;

    for (const side of ["purchase", "sale"] as ApsSide[]) {
      const pending = pendingVerifyRef.current[side];
      if (!pending) continue;
      pendingVerifyRef.current[side] = null;
      applyExtraction(side, pending);
    }
  }, [authProfile, applyExtraction]);

  /** Undo everything an agreement on this side filled in, sparing client edits. */
  const clearSidePrefill = useCallback(
    (side: ApsSide) => {
      for (const key of keysForSide(side, selectedClosingOption)) {
        if (touchedRef.current.has(key)) continue;
        setPrefillField(key, "");
        setSuggestions((prev) => {
          if (!(key in prev)) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }

      setPrefilled((prev) => ({ ...prev, [side]: [] }));
      setApsParties((prev) => ({
        ...prev,
        [side === "sale" ? "seller" : "purchaser"]: [],
      }));
      setApsAgent(null);
      setApsPartyMismatch((prev) => ({ ...prev, [side]: null }));
      setApsSelfMatch((prev) => ({ ...prev, [side]: null }));
      pendingVerifyRef.current[side] = null;
      setExtraction((prev) => ({ ...prev, [side]: EMPTY_EXTRACTION_STATE }));
      readSideRef.current[side] = false;
      readSourceRef.current[side] = null;
    },
    [selectedClosingOption, setPrefillField],
  );

  // ── Upload & read, at step 2 ───────────────────────────────

  const readAgreement = useCallback(
    async (side: ApsSide, fileUrl: string, fileName: string) => {
      readSourceRef.current[side] = fileName;
      setExtraction((prev) => ({
        ...prev,
        [side]: { status: "reading", fileName, result: null, error: null },
      }));

      try {
        const res = await fetch("/api/intake/extract-aps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_url: fileUrl, side, file_name: fileName }),
        });
        const data = await res.json();

        if (!data?.success || !data?.result) {
          // A failed read is not an error the client has to deal with — the
          // form still works, they just fill it in themselves.
          setExtraction((prev) => ({
            ...prev,
            [side]: {
              status: "error",
              fileName,
              result: null,
              error:
                data?.error ??
                "We couldn't read your agreement. You can enter the details yourself.",
            },
          }));
          // Let the next file uploaded on this side try again.
          readSideRef.current[side] = false;
          readSourceRef.current[side] = null;
          return;
        }

        const result = data.result as ApsExtractionResult;
        setExtraction((prev) => ({
          ...prev,
          [side]: { status: "done", fileName, result, error: null },
        }));
        applyExtraction(side, result);
      } catch (err) {
        console.error(`[intake] APS read failed (${side}):`, err);
        setExtraction((prev) => ({
          ...prev,
          [side]: {
            status: "error",
            fileName,
            result: null,
            error: "We couldn't read your agreement. You can enter the details yourself.",
          },
        }));
        readSideRef.current[side] = false;
        readSourceRef.current[side] = null;
      }
    },
    [applyExtraction],
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
            // us, and fileName has to keep naming the file the result came
            // from or the stored audit record points at the wrong document.
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

          // Only the first file per side is read; the rest are amendments and
          // schedules that ride along with the submission.
          if (!readSideRef.current[side]) {
            readSideRef.current[side] = true;
            await readAgreement(side, blob.url, file.name);
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
    [readAgreement],
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

      // Only undo the prefill if the file being removed is the one it came
      // from — removing an amendment shouldn't blank the agreement's values.
      if (readSourceRef.current[side] === file.name) {
        clearSidePrefill(side);
      }
    },
    [clearSidePrefill],
  );

  /**
   * Answering "No" (or switching sides) retracts that agreement's prefill.
   * Wrapped around the raw setters so Step4 doesn't have to know about it.
   */
  const handleApsSignedChange = useCallback(
    (side: ApsSide, value: "yes" | "no") => {
      if (side === "sale") setApsSaleSigned(value);
      else setApsPurchaseSigned(value);

      if (value === "no") {
        clearSidePrefill(side);
        if (side === "sale") setSaleFiles([]);
        else setPurchaseFiles([]);
        setApsBlobs((prev) => prev.filter((b) => b.side !== side));
      }
    },
    [clearSidePrefill],
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

  const progressSteps: Step[] = INTAKE_STEPS.map((s) => ({
    id: s.id,
    label: s.label,
    status: getStatus(step, s.id),
  }));

  const resetForm = () => {
    setStep(1);
    setSelected(null);
    setSelectedClosingOption(null);
    setPurchasePrice("");
    setSellingPrice("");
    setDepositAmount("");
    setSellingDepositAmount("");
    setClosingDate("");
    setSellingClosingDate("");
    setApsPurchaseSigned(null);
    setApsSaleSigned(null);
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
    authPrefillAppliedRef.current = false;

    // APS upload / extraction
    setApsBlobs([]);
    setExtraction({ purchase: EMPTY_EXTRACTION_STATE, sale: EMPTY_EXTRACTION_STATE });
    setPrefilled({ purchase: [], sale: [] });
    setSuggestions({});
    setApsParties({ purchaser: [], seller: [] });
    setApsAgent(null);
    setApsSelfMatch({ purchase: null, sale: null });
    setApsPartyMismatch({ purchase: null, sale: null });
    pendingVerifyRef.current = { purchase: null, sale: null };
    touchedRef.current = new Set();
    readSideRef.current = { purchase: false, sale: false };
    readSourceRef.current = { purchase: null, sale: null };
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
            services={services}
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
            depositAmount={depositAmount}
            setDepositAmount={setDepositAmount}
            sellingDepositAmount={sellingDepositAmount}
            setSellingDepositAmount={setSellingDepositAmount}
            closingDate={closingDate}
            setClosingDate={setClosingDate}
            sellingClosingDate={sellingClosingDate}
            setSellingClosingDate={setSellingClosingDate}
            prefilledFields={prefilledFieldSet}
            suggestions={suggestions}
            onFieldTouched={markFieldTouched}
            onAcceptSuggestion={acceptSuggestion}
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
            apsPurchaseSigned={apsPurchaseSigned}
            setApsPurchaseSigned={(v) => handleApsSignedChange("purchase", v)}
            apsSaleSigned={apsSaleSigned}
            setApsSaleSigned={(v) => handleApsSignedChange("sale", v)}
            purchaseFiles={purchaseFiles}
            setPurchaseFiles={setPurchaseFiles}
            saleFiles={saleFiles}
            setSaleFiles={setSaleFiles}
            onFilesAdded={handleApsFilesAdded}
            onFileRemoved={handleApsFileRemoved}
            extraction={extraction}
            partyMismatch={apsPartyMismatch}
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
            initialData={authProfile}
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
            apsSelfMatches={apsSelfMatches}
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
                    deposit_amount: depositAmount,
                    selling_deposit_amount:
                      selectedClosingOption === "both" ? sellingDepositAmount : null,
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
                              result: extraction.purchase.result,
                            },
                          }
                        : {}),
                      ...(extraction.sale.result
                        ? {
                            sale: {
                              file_name: extraction.sale.fileName,
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

"use client";

import { useState } from "react";
import { X } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

const inputBase =
  "w-full px-4 py-3 text-sm text-gray-900 bg-white border rounded-lg outline-none transition-colors duration-150 placeholder:text-gray-400";
const inputNormal = "border-gray-200 focus:border-[#C10007] focus:ring-2 focus:ring-[#C10007]/10";
const inputError = "border-[#C10007] ring-2 ring-[#C10007]/10";

interface ClientNameReadOnlySectionProps {
  firstName?: string | null;
  lastName?: string | null;
  leadId?: string;
}

export default function ClientNameReadOnlySection({
  firstName,
  lastName,
  leadId,
}: ClientNameReadOnlySectionProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [nameChangeModalOpen, setNameChangeModalOpen] = useState(false);
  const [requestedFirstName, setRequestedFirstName] = useState("");
  const [requestedLastName, setRequestedLastName] = useState("");
  const [nameChangeMessage, setNameChangeMessage] = useState("");
  const [nameChangeErrors, setNameChangeErrors] = useState<{
    requestedFirstName?: string;
    requestedLastName?: string;
  }>({});
  const [sendingNameRequest, setSendingNameRequest] = useState(false);

  const currentFirstName = firstName?.trim() ?? "";
  const currentLastName = lastName?.trim() ?? "";
  const currentFullName = [currentFirstName, currentLastName].filter(Boolean).join(" ");

  function openNameChangeModal() {
    setRequestedFirstName("");
    setRequestedLastName("");
    setNameChangeMessage("");
    setNameChangeErrors({});
    setNameChangeModalOpen(true);
  }

  function closeNameChangeModal() {
    setNameChangeModalOpen(false);
    setRequestedFirstName("");
    setRequestedLastName("");
    setNameChangeMessage("");
    setNameChangeErrors({});
  }

  async function handleSendNameChangeRequest() {
    const nextErrors: { requestedFirstName?: string; requestedLastName?: string } = {};
    if (!requestedFirstName.trim() && !requestedLastName.trim()) {
      nextErrors.requestedFirstName = "Please enter your requested first or last name.";
      nextErrors.requestedLastName = "Please enter your requested first or last name.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setNameChangeErrors(nextErrors);
      return;
    }

    if (!leadId) {
      toastError("Unable to send request. Please try again or contact the law clerk directly.");
      return;
    }

    setSendingNameRequest(true);
    try {
      const res = await fetch("/api/name-change-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          current_first_name: currentFirstName,
          current_last_name: currentLastName,
          requested_first_name: requestedFirstName.trim(),
          requested_last_name: requestedLastName.trim(),
          message: nameChangeMessage.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to send request");
      }

      toastSuccess("Your name change request has been sent to the law clerk.");
      closeNameChangeModal();
    } catch (err) {
      console.error(err);
      toastError("Failed to send your request. Please try again or email iclosed@navawilson.law.");
    } finally {
      setSendingNameRequest(false);
    }
  }

  return (
    <>
      <div>
        <label htmlFor="fullName" className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 mb-2">
          Full name
        </label>
        <input
          id="fullName"
          type="text"
          value={currentFullName}
          readOnly
          disabled
          aria-readonly="true"
          tabIndex={-1}
          className={[
            inputBase,
            "border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed select-none",
          ].join(" ")}
        />
        <div className="mt-1.5 flex items-center justify-between gap-4">
          <p className="text-xs text-gray-500 leading-relaxed">
            Please contact the law clerk if you would like to edit your name.
          </p>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={openNameChangeModal}
            className="bg-[#C10007] hover:bg-[#a30006] flex-shrink-0"
          >
            Request name change
          </Button>
        </div>
      </div>

      {nameChangeModalOpen && (
        <>
          <div
            className="fixed inset-0 z-[100] bg-black/40"
            onClick={() => !sendingNameRequest && closeNameChangeModal()}
            aria-hidden="true"
          />
          <div
            className="fixed inset-0 z-[110] flex items-center justify-center px-5"
            role="dialog"
            aria-modal="true"
            aria-label="Request name change"
          >
            <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden">
              <div className="px-6 pt-6 pb-4 relative border-b border-gray-100">
                <button
                  type="button"
                  onClick={closeNameChangeModal}
                  disabled={sendingNameRequest}
                  className="absolute top-4 right-4 cursor-pointer rounded-md p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
                <h3 className="text-base font-bold text-gray-900 pr-8">Request name change</h3>
                <p className="text-sm text-gray-600 leading-relaxed mt-2">
                  Submit a request to the law clerk to update your name on file. We&apos;ll review your
                  request and follow up if needed.
                </p>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div>
                  <label htmlFor="nameChangeCurrent" className="text-sm font-semibold text-gray-800 mb-2 block">
                    Current name
                  </label>
                  <input
                    id="nameChangeCurrent"
                    type="text"
                    value={currentFullName}
                    readOnly
                    disabled
                    className={[
                      inputBase,
                      "border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed",
                    ].join(" ")}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="requestedFirstName" className="text-sm font-semibold text-gray-800 mb-2 block">
                      Requested first name <span className="text-[#C10007]">*</span>
                    </label>
                    <input
                      id="requestedFirstName"
                      type="text"
                      value={requestedFirstName}
                      onChange={(e) => {
                        setRequestedFirstName(e.target.value);
                        if (nameChangeErrors.requestedFirstName || nameChangeErrors.requestedLastName) {
                          setNameChangeErrors({});
                        }
                      }}
                      placeholder="First name"
                      className={[inputBase, nameChangeErrors.requestedFirstName ? inputError : inputNormal].join(" ")}
                    />
                    {nameChangeErrors.requestedFirstName && (
                      <p className="mt-1.5 text-xs text-[#C10007]">{nameChangeErrors.requestedFirstName}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="requestedLastName" className="text-sm font-semibold text-gray-800 mb-2 block">
                      Requested last name <span className="text-[#C10007]">*</span>
                    </label>
                    <input
                      id="requestedLastName"
                      type="text"
                      value={requestedLastName}
                      onChange={(e) => {
                        setRequestedLastName(e.target.value);
                        if (nameChangeErrors.requestedFirstName || nameChangeErrors.requestedLastName) {
                          setNameChangeErrors({});
                        }
                      }}
                      placeholder="Last name"
                      className={[inputBase, nameChangeErrors.requestedLastName ? inputError : inputNormal].join(" ")}
                    />
                    {nameChangeErrors.requestedLastName && (
                      <p className="mt-1.5 text-xs text-[#C10007]">{nameChangeErrors.requestedLastName}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="nameChangeMessage" className="text-sm font-semibold text-gray-800 mb-2 block">
                    Additional details
                  </label>
                  <textarea
                    id="nameChangeMessage"
                    value={nameChangeMessage}
                    onChange={(e) => setNameChangeMessage(e.target.value)}
                    placeholder="Optional — e.g. reason for the change or spelling details"
                    rows={3}
                    className={[inputBase, inputNormal, "resize-none"].join(" ")}
                  />
                </div>
              </div>

              <div className="px-6 pb-6 flex flex-col gap-2.5">
                <Button
                  variant="primary"
                  fullWidth
                  loading={sendingNameRequest}
                  onClick={handleSendNameChangeRequest}
                  className="bg-[#C10007] hover:bg-[#a30006]"
                >
                  Send request
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  disabled={sendingNameRequest}
                  onClick={closeNameChangeModal}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

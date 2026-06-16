"use client";

interface RetainerUploadPermissionCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  isCoPerson: boolean;
  /** First name of the other client — used in co-person copy. */
  otherPersonName?: string;
  coPersonLabel: string;
}

function getCheckboxLabel({
  isCoPerson,
  otherPersonName = "your co-client",
  coPersonLabel,
}: Omit<RetainerUploadPermissionCheckboxProps, "checked" | "onChange">): string {
  if (isCoPerson) {
    return `Allow ${otherPersonName} to upload my ID and documents for this transaction.`;
  }
  return `I will upload ID and documents on behalf of my ${coPersonLabel.toLowerCase()}.`;
}

function getHelperText({
  isCoPerson,
  otherPersonName = "your co-client",
  coPersonLabel,
}: Omit<RetainerUploadPermissionCheckboxProps, "checked" | "onChange">): string {
  if (isCoPerson) {
    return `If unchecked, you will upload your own ID and documents through your iClosed account. ${otherPersonName} cannot upload for you.`;
  }
  return `If unchecked, your ${coPersonLabel.toLowerCase()} will upload their own ID and documents through their iClosed account.`;
}

export default function RetainerUploadPermissionCheckbox({
  checked,
  onChange,
  isCoPerson,
  otherPersonName,
  coPersonLabel,
}: RetainerUploadPermissionCheckboxProps) {
  const label = getCheckboxLabel({ isCoPerson, otherPersonName, coPersonLabel });
  const helper = getHelperText({ isCoPerson, otherPersonName, coPersonLabel });

  return (
    <div className="mt-5 border-t border-dashed border-gray-200 pt-5">
      <label
        htmlFor="retainer-upload-permission"
        className="flex cursor-pointer items-start gap-3 group"
      >
        <input
          id="retainer-upload-permission"
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer rounded border-gray-300 text-[#C10007] focus:ring-2 focus:ring-[#C10007]/40"
        />
        <span className="text-sm leading-relaxed text-gray-700">{label}</span>
      </label>
      <p className="mt-2 pl-7 text-xs leading-relaxed text-gray-500">{helper}</p>
    </div>
  );
}

export { getCheckboxLabel, getHelperText };

import { taskDisplayTitle } from "../taskDisplayTitle";

describe("taskDisplayTitle", () => {
  it("renames by side", () => {
    expect(taskDisplayTitle("Agreement of Purchase and Sale and Amendments", "sale")).toBe("Upload your sale agreement");
    expect(taskDisplayTitle("Agreement of Purchase and Sale and Amendments", "purchase")).toBe("Upload your purchase agreement");
    expect(taskDisplayTitle("Void Cheque", "sale")).toBe("Your sale proceeds");
    expect(taskDisplayTitle("Void Cheque", "purchase")).toBe("Void cheque");
  });

  it("maps legacy titles", () => {
    expect(taskDisplayTitle("Upload Mortgage Statement ", "sale")).toBe("Your mortgage");
    expect(taskDisplayTitle("Identification ", "purchase")).toBe("Upload your ID");
    expect(taskDisplayTitle("Deposit Funds Into Our Trust Account", "purchase")).toBe("Closing funds");
  });

  it("keeps unknown titles", () => {
    expect(taskDisplayTitle("  Confirm your property details ", null)).toBe("Confirm your property details");
  });
});

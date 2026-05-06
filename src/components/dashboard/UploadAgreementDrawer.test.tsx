import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import "@testing-library/jest-dom/jest-globals";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UploadAgreementDrawer from "./UploadAgreementDrawer";

beforeAll(() => {
    Element.prototype.scrollIntoView = jest.fn(() => {});
})
  
    it("uploads APS file", async () =>{
        const user = userEvent.setup();
        const onClose = jest.fn();
        const onSaved = jest.fn();

       
        
    const apsFile = new File(["dummy aps content"],"aps.pdf",{
        type: "application/pdf"
    });
    render(
        <UploadAgreementDrawer
        open
        onClose={onClose}
        onSaved={onSaved}
        taskId="task-99"
        />,
    );
    const dialog = screen.getByRole("dialog", { 
        name: /Upload Agreement of Purchase and Sale/i,
        hidden: true
        });
    
        //Hidden Field input inside the drop zone
    const fileInput = dialog.querySelector('input[type = "file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    await user.upload(fileInput as HTMLInputElement, apsFile);
    
    await user.upload(fileInput, apsFile);

    expect(fileInput.files?.[0]).toBe(apsFile);
    expect(fileInput.files).toHaveLength(1);

    expect(await screen.findByText("aps.pdf")).toBeInTheDocument();
    
  
    });
    
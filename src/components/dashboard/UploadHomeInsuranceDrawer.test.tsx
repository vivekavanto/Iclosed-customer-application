import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import "@testing-library/jest-dom/jest-globals";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UploadHomeInsuranceDrawer from "./UploadHomeInsuranceDrawer";



beforeAll(() =>{
    Element.prototype.scrollIntoView = jest.fn(()=>{});
})

//BDD Test case:
describe('Upload Home Insurance Policy', ()=>{
    it('Should be able to upload a policy to the box', async ()=>{
        const user = userEvent.setup();
        const onClose = jest.fn();
        const onSaved = jest.fn();
        
        const homeFile = new File(["dummy home insurance content"],"home.pdf",{
            type: "application/pdf",
           
        })
        //render in the task drawer
        render(
        <UploadHomeInsuranceDrawer 
            open
            onClose={onClose}
            onSaved = {onSaved}
            
            />,
        );
        const dialog = screen.getByRole("dialog", {
            name: /Home Insurance Policy/i,
            hidden: true
        });
        const fileInput = dialog.querySelector('input[type = "file]') as HTMLInputElement;
        expect(fileInput).not.toBeNull;
        await user.upload(fileInput as HTMLInputElement, homeFile);
        await user.upload(fileInput, homeFile);

        expect(fileInput.files?.[0]).toBe(homeFile);
        expect(fileInput.files).toHaveLength(1)

        expect(await screen.findByText("home.pdf")).toBeInTheDocument();
    });
})
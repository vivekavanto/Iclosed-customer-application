"use client";

import { useState } from "react";
import { 
  Home, 
  Briefcase, 
  FileText, 
  Check, 
  Repeat, 
  UploadCloud, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Video, 
  Clock 
} from "lucide-react";
import HorizontalProgress from "@/components/intake/HorizontalProgress";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export default function ServiceSelection() {
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedClosingOption, setSelectedClosingOption] = useState<string | null>(null);
  const [step, setStep] = useState<number>(1);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [agreementSigned, setAgreementSigned] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: ""
  });

  const services = [
    { id: "closing", title: "Property Closing", description: "Buying or selling a property? We'll guide you through the legal process—start to finish, and beyond.", icon: Home },
    { id: "refinance", title: "Mortgage Refinance", description: "Changing your current mortgage? Count on us to handle the legal side, smoothly and efficiently.", icon: Briefcase },
    { id: "condo", title: "Condo Status Certificate Report", description: "Closing on a condo? We'll review your status certificate thoroughly—at no extra charge.", icon: FileText },
  ];

  // Logic to update the progress bar status based on the "No" path being the end
  const progressSteps = [
    { id: 1, label: "Service", status: step === 1 ? "current" : step > 1 ? "complete" : "upcoming" },
    { id: 2, label: "Purchase Price", status: step === 2 ? "current" : step > 2 ? "complete" : "upcoming" },
    { id: 3, label: "Address", status: step === 3 ? "current" : step > 3 ? "complete" : "upcoming" },
    { id: 4, label: "Agreement", status: step === 4 ? "current" : (step === 5 || agreementSigned === "no") ? "complete" : "upcoming" },
    { id: 5, label: "Contact", status: (step === 5 || (step === 4 && agreementSigned === "no")) ? "current" : "upcoming" },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <main className="flex-grow flex flex-col items-center px-6 ">
        <div className="w-full max-w-7xl mb-8 px-6">
          <HorizontalProgress steps={progressSteps} />
        </div>

        {/* STEP 1: Service Selection */}
        {step === 1 && (
          <div className="max-w-7xl w-full bg-gray-50 rounded-2xl shadow-sm border border-gray-200 p-16">
            <div className="mb-16">
              <h1 className="text-4xl font-semibold tracking-tight text-gray-900">How can we assist you today?</h1>
              <p className="mt-4 text-lg text-gray-500 leading-relaxed max-w-2xl">
                Let's start by selecting the service you need so we can get things moving.
              </p>
            </div>
            <div className="space-y-8">
              {services.map((service) => {
                const Icon = service.icon;
                return (
                  <div
                    key={service.id}
                    onClick={() => setSelected(service.id)}
                    className={`cursor-pointer rounded-2xl border p-8 flex items-start gap-8 ${
                      selected === service.id ? "border-[#C10007] shadow-xl" : "border-gray-200 hover:shadow-lg"
                    }`}
                  >
                    <div className="flex-shrink-0">
                      <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center">
                        <Icon size={30} className="text-[#C10007]" strokeWidth={1.8} />
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-gray-900">{service.title}</h3>
                      <p className="mt-4 text-gray-500 leading-relaxed max-w-xl">{service.description}</p>
                    </div>
                    <div className="flex items-start pt-2">
                      <div className={`h-6 w-6 rounded-full border flex items-center justify-center transition-all duration-300 ${
                        selected === service.id ? "border-[#C10007] bg-[#C10007]" : "border-gray-300"
                      }`}>
                        {selected === service.id && <Check size={14} className="text-white" strokeWidth={3} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end mt-16">
              <Button
                disabled={!selected}
                onClick={() => setStep(2)}
                className={`px-10 py-3 rounded-sm text-base font-medium transition-all duration-300 ${
                  selected ? "bg-[#C10007] text-white" : "bg-gray-200 text-gray-400"
                }`}
              >Next</Button>
            </div>
          </div>
        )}

        {/* STEP 2: Purchase Price */}
        {step === 2 && (
          <div className="mt-8 w-full max-w-7xl mx-auto bg-gray-50 rounded-2xl border border-red-100 p-12 shadow-sm">
            <h1 className="text-3xl font-semibold mb-6">Enter the purchase price for the property.</h1>
            <Input label="Purchase Price" type="text" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="$ 1,250,000" className="mb-6" />
            <div className="flex justify-between">
              <Button onClick={() => setStep(1)} className="px-6 py-2 bg-gray-200 rounded-sm">Previous</Button>
              <Button onClick={() => setStep(3)} disabled={!purchasePrice} className="px-6 py-2 rounded-sm bg-[#C10007] text-white">Next</Button>
            </div>
          </div>
        )}

        {/* STEP 3: Address */}
        {step === 3 && (
          <div className="w-full max-w-7xl mx-auto bg-gray-50 border border-gray-200 rounded-2xl p-12 shadow-sm">
            <h1 className="text-3xl font-semibold text-gray-900 mb-8">Purchase Property Address</h1>
            <div className="space-y-8">
              <Input label="Street Address" placeholder="Start typing your address..." />
              <Input label="City" placeholder="Toronto" />
            </div>
            <div className="flex justify-between mt-14">
              <Button onClick={() => setStep(2)} className="px-6 py-2 bg-gray-200 rounded-sm">Previous</Button>
              <Button onClick={() => setStep(4)} className="px-8 py-3 bg-[#C10007] text-white rounded-sm">Next</Button>
            </div>
          </div>
        )}

        {/* STEP 4 & FINAL NO PATH */}
        {step === 4 && (
          <div className="w-full max-w-7xl mx-auto">
            {!agreementSigned ? (
              /* INITIAL AGREEMENT QUESTION */
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-12 shadow-sm space-y-6">
                <div className="mb-12">
                  <h1 className="text-3xl font-bold text-gray-900">Have you signed the Agreement of Purchase and Sale?</h1>
                  <p className="mt-4 text-lg text-gray-500">Not sure? It's the legal document that outlines the terms of your deal.</p>
                </div>
                <div onClick={() => setAgreementSigned("yes")} className={`cursor-pointer rounded-xl border-2 p-8 flex items-center justify-between transition-all ${agreementSigned === "yes" ? "border-[#C10007] bg-white" : "border-gray-200"}`}>
                  <div className="flex-1"><h3 className="text-xl font-semibold text-gray-900">Yes</h3><p className="mt-2 text-gray-500">I've signed the agreement.</p></div>
                  <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${agreementSigned === "yes" ? "border-[#C10007] bg-[#C10007]" : "border-gray-300"}`}>{agreementSigned === "yes" && <Check size={16} className="text-white" />}</div>
                </div>
                <div onClick={() => setAgreementSigned("no")} className={`cursor-pointer rounded-xl border-2 p-8 flex items-center justify-between transition-all ${agreementSigned === "no" ? "border-[#C10007] bg-white" : "border-gray-200"}`}>
                  <div className="flex-1"><h3 className="text-xl font-semibold text-gray-900">No</h3><p className="mt-2 text-gray-500">I haven't signed it yet.</p></div>
                  <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${agreementSigned === "no" ? "border-[#C10007] bg-[#C10007]" : "border-gray-300"}`}>{agreementSigned === "no" && <Check size={16} className="text-white" />}</div>
                </div>
                <div className="flex justify-between mt-12">
                  <Button onClick={() => setStep(3)} className="px-6 py-2 bg-gray-200 rounded-sm">Previous</Button>
                  <Button disabled={!agreementSigned} onClick={() => {}} className="px-8 py-3 rounded-sm bg-[#C10007] text-white">Next</Button>
                </div>
              </div>
            ) : agreementSigned === "yes" ? (
              /* IF YES: SHOW UPLOAD */
              <div className="bg-white border border-red-50 rounded-2xl p-12 shadow-sm space-y-8">
                <h1 className="text-3xl font-bold text-gray-900">Share your Agreement of Purchase and Sale <span className="text-sm font-normal bg-gray-100 px-2 py-1 rounded text-gray-600">Optional</span></h1>
                <div className="border-2 border-dashed border-gray-200 rounded-2xl p-20 flex flex-col items-center justify-center bg-white cursor-pointer" onClick={() => document.getElementById('file-upload')?.click()}>
                  <UploadCloud size={24} className="text-gray-400 mb-4" />
                  <p className="text-gray-600">Click to <span className="text-red-600 font-medium">browse</span> or drag and drop your file</p>
                  <input id="file-upload" type="file" className="hidden" />
                </div>
                <div className="flex justify-between pt-6">
                    <Button onClick={() => setAgreementSigned(null)} className="px-8 py-2 bg-white border border-gray-200 rounded-md">Previous</Button>
                    <Button onClick={() => setStep(5)} className="px-10 py-2 bg-[#C10007] text-white rounded-md">Next</Button>
                </div>
              </div>
            ) : (
              /* IF NO: THIS IS THE FINAL CONSULTATION STEP (IMAGE 3) */
              <div className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-16 shadow-sm">
                <div className="mb-10">
                  <h1 className="text-3xl font-semibold text-gray-900">Please select a time slot for a free consultation to review your transaction</h1>
                  <p className="mt-2 text-lg text-gray-500">We'll use your details to send updates and guide you through the process.</p>
                </div>

                <div className="space-y-10 mb-12">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3"><span className="text-red-600">*</span> Full Name</label>
                    <Input placeholder="John Doe" value={formData.fullName} onChange={(e) => setFormData({...formData, fullName: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3"><span className="text-red-600">*</span> Email Address</label>
                    <Input placeholder="john@doe.com" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3"><span className="text-red-600">*</span> Phone Number</label>
                    <Input placeholder="(555)-123-4567" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
                  </div>
                  <div className="pt-4">
                    <div className="flex items-center gap-2 mb-4 text-gray-900 font-semibold text-lg">
                      <span className="w-5 h-3 bg-red-600 rounded-sm inline-block"></span> Co-Purchaser
                    </div>
                    <Button className="w-full py-4 border border-dashed border-red-200 rounded-lg text-gray-900 font-medium flex items-center justify-center gap-2">
                      <Plus size={18} /> Add Co-Purchaser
                    </Button>
                  </div>
                </div>

                {/* Calendar Integrated Widget */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col md:flex-row min-h-[500px] mb-12">
                  <div className="w-full md:w-1/3 p-8 border-r border-gray-100">
                    <p className="text-gray-500 font-medium">Nava Wilson</p>
                    <h2 className="text-2xl font-bold text-gray-900 mt-1">IClosed Lead Meeting</h2>
                    <div className="mt-6 space-y-4">
                      <div className="flex items-center gap-3 text-gray-600"><Clock size={20} /> 15 min</div>
                      <div className="flex items-start gap-3 text-gray-600"><Video size={20} /> Web conferencing details provided upon confirmation.</div>
                    </div>
                  </div>
                  <div className="flex-1 p-8">
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-xl font-bold text-gray-900">Select a Date & Time</h3>
                      <div className="flex items-center gap-4 text-gray-600">February 2026 
                        <div className="flex gap-1"><ChevronLeft size={20} /><ChevronRight size={20} className="text-blue-600"/></div>
                      </div>
                    </div>
                    <div className="grid grid-cols-7 gap-y-8 text-center">
                      {['MON','TUE','WED','THU','FRI','SAT','SUN'].map(d => <div key={d} className="text-xs font-bold text-gray-400">{d}</div>)}
                      {Array.from({length: 28}, (_, i) => i + 1).map(day => (
                        <div key={day} className={`py-2 rounded-full ${day >= 25 ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-900'}`}>{day}</div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button onClick={() => setAgreementSigned(null)} className="px-10 py-3 bg-white border border-gray-200 rounded-lg font-medium text-gray-900 flex items-center gap-2">
                    <ChevronLeft size={18}/> Previous
                  </Button>
                  <Button onClick={() => alert("Final Step: Submission complete!")} className="px-12 py-3 bg-[#C10007] text-white rounded-lg font-semibold hover:bg-red-700">Complete</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 5: Final Step (Only for "Yes" path) */}
        {step === 5 && (
          <div className="w-full max-w-7xl mx-auto bg-gray-50 border border-gray-200 rounded-2xl p-16 shadow-sm">
             <h1 className="text-3xl font-semibold text-gray-900 mb-10">We'll be in touch</h1>
             <div className="space-y-10">
                <Input label="Full Name" placeholder="John Doe" />
                <Input label="Email Address" placeholder="john@doe.com" />
                <Input label="Phone Number" placeholder="(555)-123-4567" />
             </div>
             <div className="flex justify-between mt-16">
                <Button onClick={() => setStep(4)} className="px-6 py-2 bg-gray-200 rounded-sm">Previous</Button>
                <Button onClick={() => alert("Submission complete!")} className="px-12 py-3 bg-[#C10007] text-white rounded-lg font-semibold">Complete</Button>
             </div>
          </div>
        )}
      </main>
      
    </div>
  );
}
# TOPIADESK CRM - SALESFORCE FINANCIAL SERVICES CLOUD FOR INSURANCE - FULL BUILD SPECIFICATION
## Master Prompt Document for AI Agent / Development Team
## For SCIB Nigeria & Co. Use Case - Top 3 Insurance Broker

> GOAL: Replicate 100% of Salesforce Financial Services Cloud for Insurance functionality into Topiadesk CRM. This document is the single source of truth.

### 1. ARCHITECTURE OVERVIEW
- **Type:** Multi-tenant SaaS, metadata-driven
- **Base:** Account/Contact model extended with Person Accounts (individual) + Business Accounts (corporate) + Household (record type of Account)
- **Extension Layer:** Insurance Industries Extension - 80+ new objects, 100% additive to core
- **UI Framework:** Lightning-style - Component-based (FlexCards, LWC equivalents), App Builder drag-drop
- **Automation:** Flow engine (Trigger, Scheduled, Screen Flows) + Action Plans
- **APIs:** REST, Bulk 2.0, Streaming, GraphQL equivalent

### 2. CORE DATA MODEL - ALL OBJECTS & FIELDS

#### A. CUSTOMER MODEL
**Account**
- Fields: RecordType (Individual, Household, Business), Name, Industry, Type, Primary Contact, AUM, Risk Profile, KYC Status, KYC Expiry, NAICOM ID
- Related: Contacts, Insurance Policies, Claims, Financial Accounts, Households

**Contact / Person Account**
- Fields: FirstName, LastName, Email, Phone, WhatsApp, DateOfBirth, ID Type, ID Number, Selfie URL, Risk Score, Lifetime Premium, Lifetime Commission, Churn Risk
- Objects: Person Life Event (Marriage, Child Birth, Job Change), Identity Document (ID Card, Utility Bill, CAC), Customer Property

**Household (Account Record Type)**
- Fields: Household Name, Primary Member, Total AUM, Total Premium, Number of Members
- Junction: AccountContactRelationship, Party Relationship Group

#### B. POLICY MANAGEMENT - CORE FOR BROKER
**InsurancePolicy (Master Object)**
- Fields: PolicyNumber (unique, auto), PolicyName, PolicyType (Life, Motor, Fire, Marine, Aviation, Health, etc), Status (Draft, Quoted, Bound, Issued, Active, Expired, Cancelled, Renewed), EffectiveDate, ExpirationDate, RenewalDate, Premium (Annual, Gross, Net), Commission %, Commission Amount, Carrier (Lookup to Account - Insurer), Producer (Lookup - broker who sold), Broker of Record, Original Policy (lookup), Renewed From Policy, Sum Insured, Deductible, Currency (NGN, USD), Underwriter, Reinsurance Status, Document URL
- Related Lists: Coverages, Participants, Assets, Transactions, Claims, Commissions, Documents

**InsurancePolicyCoverage**
- Fields: Coverage Name, Coverage Type (Third Party, Comprehensive), Sum Insured, Premium, Deductible, Limits, Sub-limits, Conditions

**InsurancePolicyParticipant**
- Fields: Participant Type (Insured, Beneficiary, Nominee, Driver, Additional Insured), Contact lookup, Relationship, Percentage

**InsurancePolicyAsset (Insured Item)**
- Fields: Asset Type (Vehicle, Property, Cargo, Vessel), Asset Name, Registration No, Chassis No, Address, Valuation, Year, Make/Model, Location (Geolocation)

**InsurancePolicyTransaction (Endorsement)**
- Fields: Transaction Type (Issuance, Endorsement, Cancellation, Reinstatement), Transaction Date, Premium Change, Description

**Product & ProductCoverage**
- Fields: Product Name, Product Code, Carrier, Product Line, Coverage list, Rating Table

#### C. CLAIMS MANAGEMENT
**Claim (Master)**
- Fields: ClaimNumber, Policy lookup, Claim Type (Property, Casualty, Motor, Health, Life, Aviation), Status (FNOL, Open, Under Review, Approved, Rejected, Closed, Paid), Loss Date, Reported Date, Loss Description, Loss Location, Estimated Loss, Paid Amount, Reserved Amount, Adjuster (User), FNOL Channel (Phone, Portal, Email, WhatsApp), Priority, SLA Due Date

**ClaimItem**
- Fields: Item Description, Damaged Asset lookup, Quantity, Unit Cost, Total Loss

**ClaimParticipant**
- Fields: Role (Claimant, Witness, Adjuster, Lawyer), Contact

**ClaimCoverage & Claim Payment Summary**
- Fields: Coverage lookup, Payable Amount, Deductible Applied, Approval Status, Payment Date, Payment Method

**InsuranceClaimAsset**
- Link claim to specific insured asset

#### D. PRODUCER / BROKER MANAGEMENT - CRITICAL FOR SCIB
**Producer (Agent/Agency)**
- Fields: Producer Code, Producer Name, Type (Internal Broker, External Sub-broker, Aon Correspondent), License Number, License Expiry, Commission Tier, Parent Producer (hierarchy), Status (Active, Suspended), Phone, Email, State

**ProducerPolicyAssignment**
- Fields: Policy lookup, Producer lookup, Role (Primary, Sub-producer, Servicing), Commission Split %, Commission Amount

**ProducerCommission**
- Fields: Commission Number, Policy, Producer, Premium Base, Commission %, Commission Amount, VAT, WHT, Net Payable, Status (Pending, Approved, Paid), Payment Date, Period

**DistributorAuthorization & AuthorizedInsuranceLine**
- Fields: Producer, Carrier, Line of Business, Authorization Date, Expiry

**BusinessLicense & Credential**
- Fields: License Type (NAICOM, NCRIB), Number, Expiry, Document

#### E. BILLING & FINANCE
- Invoice, Payment, Financial Transaction (Premium Collection, Commission Receipt)

### 3. MODULES & TABS / NAVIGATION
**App: Topiadesk Insurance Console (Like Salesforce Insurance Console)**

- **Home:** Dashboards, Tasks, Renewals Due, Claims Open
- **Clients:** Accounts, Contacts, Households, Groups
- **Policies:** Insurance Policies, Renewals Queue, Endorsements, Assets
- **Claims:** Claims, FNOL Inbox, My Adjustments
- **Producers:** Producers, Commissions, Hierarchy View, Licenses
- **Sales:** Leads, Opportunities, Quotes (with Quote UI)
- **Work:** Cases, Action Plans, Documents
- **Reports:** All Reports, Dashboards

### 4. UI / UX SPECIFICATION - SALESFORCE LIGHTNING CLONE

**A. Lightning Record Page Structure:**
- Header: Highlights Panel (Policy Number, Status badge, Premium, Expiry countdown)
- Left: Details Tab, Related Tabs
- Right: FlexCards Stack

**B. Key Components to Build:**
1. **Policy Details Component:** Card showing Policy No, Type, Status, Carrier logo, Premium, Sum Insured, Expiry progress bar
2. **Client 360 FlexCard:** Shows Total Policies (Active/Expired), Total Premium YTD, Open Claims, Renewals Due in 90 days, Lifetime Value
3. **Household View:** Tree view of parent company + subsidiaries + directors
4. **Claim Timeline:** Vertical timeline of FNOL > Assignment > Assessment > Approval > Payment
5. **Producer Hierarchy Component:** Org chart of Producer > Sub-producers with premium rollup
6. **Action Components:** Buttons - Issue Policy, Modify Policy (Endorsement), Renew Policy, Report Claim, Generate Debit Note, Deep Clone Policy

**C. Page Layouts Required:**
- Corporate Client Page (with Subsidiaries related list, Policies by Subsidiary, Group Premium Rollup)
- Individual Client Page (with Policies, Claims, Life Events)
- Policy Page (with Coverages tab, Assets tab, Participants tab, Claims tab, Transactions tab, Documents tab)
- Claim Page (with Items, Participants, Payments)

### 5. AUTOMATION & WORKFLOWS

**Flows to Build:**
1. **Renewal Flow:** Scheduled daily - Find Policies where ExpiryDate = TODAY+90 days -> Create Renewal Opportunity -> Create Task for Producer -> Send WhatsApp/Email to Client + Producer
2. **FNOL Flow:** When Claim created via Portal/WhatsApp -> Auto-assign to Adjuster by workload -> Send acknowledgment -> Create Case -> Start SLA Milestone
3. **Commission Flow:** When Policy Status = Issued -> Calculate ProducerCommission based on ProducerPolicyAssignment split % -> Create Commission record -> Notify Finance
4. **KYC Expiry Flow:** If Contact KYC Expiry < 30 days -> Block renewal quote -> Send notification
5. **Action Plan Templates:** Aviation Renewal (23 steps), Motor Claim Process (15 steps) - auto-create tasks with dependencies

**Entitlements / SLA:**
- Claim First Response: 2 hours
- Claim Resolution: 48 hours (Motor), 14 days (Property)
- Renewal Quote: 5 days before expiry

### 6. INTEGRATIONS & APIS

**Internal APIs to Expose:**
- POST /api/v1/policies - Create policy
- GET /api/v1/policies/{number} - Get policy with coverages
- POST /api/v1/claims/fnol - First Notice of Loss
- POST /api/v1/producers/commissions/calculate
- Webhooks: policy.issued, claim.status_changed, renewal.due

**External Integrations to Build:**
- **Paystack/Flutterwave:** Webhook for premium collection -> Update Invoice + Commission
- **Dojah/Smile Identity:** KYC verification API -> Update Contact KYC Status
- **Twilio/WhatsApp Cloud:** Send renewal, claim updates, collect FNOL via WhatsApp
- **DocuSign:** Generate Policy Schedule, Debit Note PDF
- **Carrier APIs:** Leadway, AIICO, Custodian rating API (Integration Procedure pattern)
- **Aon Reinsurance:** Export bordereau via SFTP/API

**Data Import:**
- Bulk API 2.0 equivalent: Upload 10 years Excel policies -> Map to InsurancePolicy + Coverage + Asset

### 7. SECURITY MODEL
- Profiles: Super Admin, Broker Manager, Broker, Claims Handler, Finance, Compliance, ReadOnly
- Roles: Hierarchy - SCIB MD > HOD > Team Lead > Broker
- Field Level Security: Commission Amount visible only to Manager + Finance
- Sharing: Private - Broker sees only his policies, Manager sees team
- Audit Trail: Every field change logged with User, Time, Old/New Value (for NAICOM audit)

### 8. REPORTS & DASHBOARDS
**Dashboards Required:**
1. **Executive Dashboard (for MD Shola Tinubu):** Gross Written Premium YTD, Renewal Rate %, Loss Ratio, Top 10 Clients by Premium, Premium by Carrier, Commission Payable
2. **Renewal Dashboard:** Renewals due 90/60/30 days, Renewal rate by Producer, Lost renewals
3. **Claims Dashboard:** Open claims by type, Avg settlement time, Claims by carrier, Top loss causes
4. **Producer Dashboard:** Premium by Producer, Commission by Producer, Hit rate
5. **Finance Dashboard:** Premium collected vs outstanding, Commission paid vs pending

**Reports:** Policy Register, Claims Register, Bordereau for Aon, NAICOM Returns, Renewal List

### 9. PORTALS
- **Client Portal:** Login to view my policies, download documents, report claim (FNOL form), track claim status, see renewal due
- **Producer Portal:** Sub-broker login to see my clients, my policies, my commission statement

### 10. TECHNICAL BUILD INSTRUCTIONS FOR AGENT
- Use React + Tailwind for UI components to mimic Salesforce Lightning Design System (SLDS)
- Backend: Node.js/Prisma or Laravel - create all objects as database tables with relationships as described
- Build Generic Object Manager: Admin can create custom fields, page layouts
- Build Flow Builder: Visual workflow
- Build FlexCard Builder: Drag-drop cards
- Implement Deep Clone: Clone policy with all children in transaction
- Seed data: 40+ product types, 20 carriers (Leadway, AIICO, AXA Mansard, Custodian, etc), Producer hierarchy

**Deliverable:** Topiadesk CRM should be able to pass Salesforce FSC Insurance certification checklist - every tab, object, field, automation listed above working.

### END OF SPEC

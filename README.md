# VeriFi AI

Wallet-native finance with optional on-chain loans. This repo is a **10–15 minute blockchain hiring screen**.

## Your task

`VeriFiLoan` can create / approve / disburse a loan, but it cannot record **partial repayments**. Finish that in `contracts/VeriFiLoan.sol`.

Do not edit the tests.

```bash
npm run contracts:install
npm run contracts:test
```

You should see failing tests under `recordPayment` / `remainingOf`. Make them pass.

### Implement

1. **`recordPayment(uint256 loanId, uint256 amountCents)`**
   - Platform **or** the borrower may call it
   - Loan must be `Disbursed`
   - `amountCents` must be `> 0` and `<=` remaining
   - Decrease remaining
   - If remaining hits 0, set status to `Repaid` and emit `LoanStatusUpdated`
   - Emit `PaymentRecorded(loanId, payer, amountCents, remainingCents)`

2. **`remainingOf(uint256 loanId) view returns (uint256)`**
   - Revert `LoanNotFound` if the loan does not exist

3. **Fix `markDefaulted`**
   - It currently defaults an `Approved` loan. Only `Disbursed` is allowed.
   - Anything else (including `Repaid`) must revert `InvalidStatusTransition`

Use the custom errors already on the contract. Do not change function signatures, events, or the `Loan` struct.

## Submit

Work on your own branch and push it. Reviewers grade that branch.

```bash
git checkout -b <your-name>/verifi-loan
git add contracts/VeriFiLoan.sol
git commit -m "Record partial loan repayments"
git push -u origin HEAD
```

## Optional: run the app

```bash
cp .env.example .env
npm install
npm run db:push
npm run db:seed
npm run dev
```

App: http://localhost:5173 · API: http://localhost:3001

const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('VeriFiLoan', function () {
  let loan, owner, platform, borrower;

  beforeEach(async function () {
    [owner, platform, borrower] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('VeriFiLoan');
    loan = await Factory.deploy(platform.address);
    await loan.waitForDeployment();
  });

  it('creates a loan', async function () {
    const offChainId = ethers.id('loan-uuid-1');
    await expect(
      loan.connect(platform).createLoan(offChainId, borrower.address, 100000, 1299, 12, 8900)
    )
      .to.emit(loan, 'LoanCreated')
      .withArgs(1n, offChainId, borrower.address, 100000n, 1299n, 12n);

    const stored = await loan.getLoan(1);
    expect(stored.borrower).to.equal(borrower.address);
    expect(stored.status).to.equal(0); // Pending
  });

  it('approve -> disburse', async function () {
    const offChainId = ethers.id('loan-uuid-2');
    await loan.connect(platform).createLoan(offChainId, borrower.address, 50000, 1299, 6, 8500);
    await loan.connect(platform).approveLoan(1);
    await loan.connect(platform).disburseLoan(1);
    const stored = await loan.getLoan(1);
    expect(stored.status).to.equal(2); // Disbursed
  });

  it('non-platform cant create', async function () {
    const offChainId = ethers.id('loan-uuid-3');
    await expect(
      loan.connect(borrower).createLoan(offChainId, borrower.address, 1000, 100, 1, 100)
    ).to.be.revertedWithCustomError(loan, 'Unauthorized');
  });

  describe('remainingOf / recordPayment', function () {
    let stranger;

    async function disburse(amountCents = 10_000) {
      const offChainId = ethers.id(`loan-pay-${amountCents}-${Date.now()}`);
      await loan.connect(platform).createLoan(offChainId, borrower.address, amountCents, 1299, 12, 900);
      await loan.connect(platform).approveLoan(1);
      await loan.connect(platform).disburseLoan(1);
    }

    beforeEach(async function () {
      [, , , stranger] = await ethers.getSigners();
    });

    it('remainingOf returns the outstanding balance', async function () {
      await disburse(10_000);
      expect(await loan.remainingOf(1)).to.equal(10_000n);
    });

    it('remainingOf reverts when the loan does not exist', async function () {
      await expect(loan.remainingOf(99)).to.be.revertedWithCustomError(loan, 'LoanNotFound');
    });

    it('borrower can pay and remaining drops', async function () {
      await disburse(10_000);
      await expect(loan.connect(borrower).recordPayment(1, 4_000))
        .to.emit(loan, 'PaymentRecorded')
        .withArgs(1n, borrower.address, 4_000n, 6_000n);
      expect(await loan.remainingOf(1)).to.equal(6_000n);
      expect((await loan.getLoan(1)).status).to.equal(2); // Disbursed
    });

    it('platform can record a payment', async function () {
      await disburse(10_000);
      await loan.connect(platform).recordPayment(1, 1_000);
      expect(await loan.remainingOf(1)).to.equal(9_000n);
    });

    it('final payment marks the loan Repaid', async function () {
      await disburse(10_000);
      await expect(loan.connect(borrower).recordPayment(1, 10_000))
        .to.emit(loan, 'PaymentRecorded')
        .withArgs(1n, borrower.address, 10_000n, 0n)
        .and.to.emit(loan, 'LoanStatusUpdated')
        .withArgs(1n, 2, 3); // Disbursed -> Repaid
      const stored = await loan.getLoan(1);
      expect(stored.status).to.equal(3);
    });

    it('rejects a stranger', async function () {
      await disburse(10_000);
      await expect(loan.connect(stranger).recordPayment(1, 100)).to.be.revertedWithCustomError(
        loan,
        'Unauthorized'
      );
    });

    it('rejects zero and overpayment', async function () {
      await disburse(10_000);
      await expect(loan.connect(borrower).recordPayment(1, 0)).to.be.revertedWithCustomError(
        loan,
        'InvalidAmount'
      );
      await expect(loan.connect(borrower).recordPayment(1, 10_001)).to.be.revertedWithCustomError(
        loan,
        'InvalidAmount'
      );
    });

    it('rejects payment before disbursal', async function () {
      const offChainId = ethers.id('loan-not-disbursed');
      await loan.connect(platform).createLoan(offChainId, borrower.address, 5_000, 1299, 6, 900);
      await expect(loan.connect(borrower).recordPayment(1, 100)).to.be.revertedWithCustomError(
        loan,
        'InvalidStatusTransition'
      );
    });
  });

  describe('markDefaulted', function () {
    it('defaults a disbursed loan', async function () {
      const offChainId = ethers.id('loan-default-ok');
      await loan.connect(platform).createLoan(offChainId, borrower.address, 5_000, 1299, 6, 900);
      await loan.connect(platform).approveLoan(1);
      await loan.connect(platform).disburseLoan(1);
      await loan.connect(platform).markDefaulted(1);
      expect((await loan.getLoan(1)).status).to.equal(4);
    });

    it('cannot default an approved loan', async function () {
      const offChainId = ethers.id('loan-default-approved');
      await loan.connect(platform).createLoan(offChainId, borrower.address, 5_000, 1299, 6, 900);
      await loan.connect(platform).approveLoan(1);
      await expect(loan.connect(platform).markDefaulted(1)).to.be.revertedWithCustomError(
        loan,
        'InvalidStatusTransition'
      );
    });
  });
});

describe('TrustAttestation', function () {
  let attestation, attester, subject;

  beforeEach(async function () {
    [, attester, subject] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('TrustAttestation');
    attestation = await Factory.deploy(attester.address);
    await attestation.waitForDeployment();
  });

  it('writes a score', async function () {
    const decisionHash = ethers.id('approve');
    const factorsHash = ethers.id('factors');
    await expect(
      attestation.connect(attester).attest(subject.address, 42, decisionHash, factorsHash, '1.0.0')
    )
      .to.emit(attestation, 'TrustAttested')
      .withArgs(1n, subject.address, 42n, decisionHash, '1.0.0');

    const latest = await attestation.getLatestAttestation(subject.address);
    expect(latest.riskScore).to.equal(42n);
  });
});

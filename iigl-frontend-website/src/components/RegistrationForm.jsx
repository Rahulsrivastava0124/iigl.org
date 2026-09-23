import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CircleCheck, CreditCard, UserPlus } from 'lucide-react';
import { postPublic } from '../lib/api.js';
import { paymentConfig, registerAndPay } from '../lib/cashfree.js';

const rupees = (n) => `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const inputClass =
  'h-11 w-full rounded-lg border border-[#e6e8ee] bg-[#f8f9fb] px-3 text-[14px] text-[#3c4252] outline-none placeholder:text-[#8b93a7] focus:border-[#d58a2b] focus:bg-white';
const labelClass = 'mb-1.5 block text-[13px] font-medium text-[#2c3b64]';

const BLANK = {
  name: '',
  father_name: '',
  dob: '',
  gender: '',
  mobile: '',
  alt_mobile: '',
  email: '',
  city: '',
  state: '',
  pincode: '',
  address: '',
  message: '',
};

function Field({ label, wide, children }) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

/**
 * Register for a course: the details the panel's New Registration form takes,
 * with the confirmation mailed to the student. The documents are collected in
 * person.
 *
 * Two steps when the course has a fee and online payment is set up: the details,
 * then the course and its fee, with two ways to finish:
 *
 *   Pay & register   the fee (plus GST) is taken in Cashfree's window; once the
 *                    API confirms it with Cashfree the student is registered,
 *                    active, and enrolled with the fee paid.
 *   Register only    saved as a pending registration for head office to call,
 *                    as before.
 */
export default function RegistrationForm({ courseId, course, fee, feeTotal, facts = [] }) {
  const [form, setForm] = useState(BLANK);
  // 'details' is the form; 'pay' is the course, its fee and how to finish.
  const [step, setStep] = useState('details');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [gateway, setGateway] = useState({ enabled: false, mode: 'sandbox' });
  const root = useRef(null);

  useEffect(() => {
    paymentConfig().then(setGateway);
  }, []);

  const payable = gateway.enabled && Number(feeTotal) >= 1;
  const testMode = gateway.mode !== 'production';

  /**
   * The form sits in a <dialog>, which the browser keeps above everything —
   * including Cashfree's window. It steps aside while the checkout is open and
   * comes back with the result.
   */
  const pay = async () => {
    setSending(true);
    setError('');
    const dialog = root.current?.closest('dialog');
    const wasOpen = Boolean(dialog?.open);
    try {
      const outcome = await registerAndPay(
        { course_id: courseId, ...form },
        {
          beforeCheckout: () => wasOpen && dialog.close(),
          afterCheckout: () => wasOpen && !dialog.open && dialog.showModal(),
        },
      );
      if (outcome.status === 'paid') {
        setDone({ ...outcome.result, paid: outcome.amount, mode: outcome.mode });
      } else {
        setError('The payment was not completed, so you have not been registered. Nothing was charged — try again when ready.');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));
  const today = new Date().toISOString().slice(0, 10);

  // With nothing to pay online there is no second step: Register saves it.
  const submit = (event) => {
    event.preventDefault();
    setError('');
    if (payable) {
      setStep('pay');
      root.current?.scrollIntoView({ block: 'start' });
    } else register();
  };

  const register = async () => {
    setSending(true);
    setError('');
    try {
      const body = await postPublic('/public/student-registrations', { course_id: courseId, ...form });
      setDone(body.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div ref={root} className="rounded-xl border border-[#e6e8ee] bg-white p-6 shadow-[0_15px_38px_rgba(44,59,100,0.08)] sm:p-8">
      <h2 className="m-0 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[28px] font-medium text-[#061948]">
        {step === 'pay' && !done ? 'Confirm and pay' : 'Register for this course'}
      </h2>

      {done ? (
        <div role="status" className="mt-5 rounded-lg border border-[#b7e0c2] bg-[#f1faf3] p-5">
          <p className="m-0 flex items-center gap-2 text-[16px] font-semibold text-[#1b7a3a]">
            <CircleCheck aria-hidden className="h-5 w-5" /> {done.paid ? 'Payment received — you are registered' : 'Registration received'}
          </p>
          <dl className="m-0 mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]">
            <dt className="text-[#4a5265]">Registration No.</dt>
            <dd className="m-0 font-mono font-semibold text-[#061948]">{done.registration_no}</dd>
            <dt className="text-[#4a5265]">Course</dt>
            <dd className="m-0 font-medium text-[#061948]">{done.course}</dd>
            <dt className="text-[#4a5265]">Status</dt>
            <dd className={`m-0 font-medium ${done.paid ? 'text-[#1b7a3a]' : 'text-[#bd7724]'}`}>{done.paid ? 'Active' : 'Pending'}</dd>
            {done.paid && (
              <>
                <dt className="text-[#4a5265]">Fee paid</dt>
                <dd className="m-0 font-medium text-[#061948]">
                  {rupees(done.paid)}
                  {done.mode === 'sandbox' && <span className="ml-2 text-[12px] font-semibold text-[#b26a00]">TEST MODE</span>}
                </dd>
              </>
            )}
          </dl>
          <p className="m-0 mt-4 text-[14.5px] leading-[1.65] text-[#3c4252]">
            Thank you, <strong className="font-semibold">{form.name.trim()}</strong>.{' '}
            {done.mailed && <>We have emailed these details to {form.email.trim()}. </>}
            {done.paid
              ? `Our team will call you on ${form.mobile.trim()} to confirm your batch.`
              : `Our team will call you on ${form.mobile.trim()} to confirm the batch, the fees and admission.`}
          </p>
        </div>
      ) : step === 'pay' ? (
        <div className="mt-5 grid gap-4">
          <div className="rounded-lg border border-[#e6e8ee] bg-[#f8f9fb] p-5">
            <p className="m-0 text-[12px] font-medium uppercase tracking-[0.08em] text-[#8b93a7]">Course</p>
            <p className="m-0 mt-1 text-[18px] font-semibold text-[#061948]">{course}</p>
            {facts.length > 0 && <p className="m-0 mt-1 text-[13.5px] text-[#4a5265]">{facts.join(' · ')}</p>}

            <dl className="m-0 mt-4 grid grid-cols-[1fr_auto] gap-y-1.5 border-t border-[#e6e8ee] pt-4 text-[14px] text-[#3c4252]">
              {Number(feeTotal) > Number(fee) && (
                <>
                  <dt>Course fee</dt>
                  <dd className="m-0 text-right">{rupees(fee)}</dd>
                  <dt>GST</dt>
                  <dd className="m-0 text-right">{rupees(Number(feeTotal) - Number(fee))}</dd>
                </>
              )}
              <dt className="font-semibold text-[#061948]">Total</dt>
              <dd className="m-0 text-right text-[17px] font-semibold text-[#061948]">{rupees(feeTotal)}</dd>
            </dl>
            <p className="m-0 mt-4 text-[13.5px] text-[#4a5265]">
              Student: <span className="font-medium text-[#2c3b64]">{form.name.trim()}</span> · {form.mobile.trim()}
            </p>
          </div>

          {testMode && (
            <p className="m-0 text-[12.5px] font-medium text-[#b26a00]">
              Test mode — pay with Cashfree test cards or UPI. No real money is charged.
            </p>
          )}
          {error && (
            <p role="alert" className="m-0 text-[14px] text-[#c62828]">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={pay}
            disabled={sending}
            className="inline-flex h-[50px] cursor-pointer items-center justify-center gap-3 rounded-lg border-0 bg-linear-to-b from-[#df9d3d] to-[#bd7724] px-6 text-[15px] font-medium text-white transition-opacity hover:opacity-95 disabled:cursor-wait disabled:opacity-60"
          >
            <CreditCard className="h-[18px] w-[18px]" strokeWidth={1.8} />
            {sending ? 'Please wait…' : `Pay ${rupees(feeTotal)} now`}
          </button>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setStep('details')}
              disabled={sending}
              className="inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-[14px] font-medium text-[#2c3b64] hover:underline disabled:cursor-wait"
            >
              <ArrowLeft className="h-4 w-4" /> Edit details
            </button>
            <button
              type="button"
              onClick={register}
              disabled={sending}
              className="cursor-pointer border-0 bg-transparent p-0 text-[14px] font-medium text-[#bd7724] hover:underline disabled:cursor-wait"
            >
              Pay later at the institute
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="m-0 mt-2 text-[15px] leading-[1.7] text-[#4a5265]">
            Registering for <span className="font-medium text-[#2c3b64]">{course}</span>. Fill in your details and we email you the registration number.
          </p>
          <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
            <Field label="Student name *">
              <input className={inputClass} value={form.name} onChange={set('name')} required maxLength={150} autoComplete="name" />
            </Field>
            <Field label="Father / guardian name">
              <input className={inputClass} value={form.father_name} onChange={set('father_name')} maxLength={150} />
            </Field>
            <Field label="Date of birth">
              <input className={inputClass} type="date" value={form.dob} onChange={set('dob')} max={today} autoComplete="bday" />
            </Field>
            <Field label="Gender">
              <select className={inputClass} value={form.gender} onChange={set('gender')}>
                <option value="">Not stated</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Mobile number *">
              <input className={inputClass} type="tel" value={form.mobile} onChange={set('mobile')} required minLength={10} maxLength={20} autoComplete="tel" />
            </Field>
            <Field label="Alternate number">
              <input className={inputClass} type="tel" value={form.alt_mobile} onChange={set('alt_mobile')} minLength={10} maxLength={20} />
            </Field>
            <Field label="Email *" wide>
              <input className={inputClass} type="email" value={form.email} onChange={set('email')} required maxLength={150} autoComplete="email" />
            </Field>
            <Field label="City">
              <input className={inputClass} value={form.city} onChange={set('city')} maxLength={100} autoComplete="address-level2" />
            </Field>
            <Field label="State">
              <input className={inputClass} value={form.state} onChange={set('state')} maxLength={100} autoComplete="address-level1" />
            </Field>
            <Field label="Pincode">
              <input
                className={inputClass}
                value={form.pincode}
                onChange={set('pincode')}
                inputMode="numeric"
                pattern="[0-9]{6}"
                title="Six digits"
                maxLength={6}
                autoComplete="postal-code"
              />
            </Field>
            <Field label="Address" wide>
              <textarea className={`${inputClass} h-auto py-2.5`} rows={2} value={form.address} onChange={set('address')} maxLength={255} autoComplete="street-address" />
            </Field>
            <Field label="Message" wide>
              <textarea className={`${inputClass} h-auto py-2.5`} rows={2} value={form.message} onChange={set('message')} maxLength={1000} />
            </Field>

            <p className="m-0 text-[13px] text-[#8b93a7] sm:col-span-2">
              Your photograph, ID proof and qualification documents are collected when you visit.
            </p>
            {error && (
              <p role="alert" className="m-0 text-[14px] text-[#c62828] sm:col-span-2">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={sending}
              className="inline-flex h-[50px] cursor-pointer items-center justify-center gap-3 rounded-lg border-0 bg-[#061948] px-6 text-[15px] font-medium text-white transition-colors hover:bg-[#10285e] disabled:cursor-wait disabled:opacity-60 sm:col-span-2"
            >
              <UserPlus className="h-[18px] w-[18px]" strokeWidth={1.8} />
              {sending ? 'Registering…' : 'Register'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

import { useState } from 'react';
import { CircleCheck, UserPlus } from 'lucide-react';
import { postPublic } from '../lib/api.js';

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
 * saved as a pending registration in Student › Registration, with the
 * confirmation mailed to the student. The documents are collected in person.
 */
export default function RegistrationForm({ courseId, course }) {
  const [form, setForm] = useState(BLANK);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));
  const today = new Date().toISOString().slice(0, 10);

  const submit = async (event) => {
    event.preventDefault();
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
    <div className="rounded-xl border border-[#e6e8ee] bg-white p-6 shadow-[0_15px_38px_rgba(44,59,100,0.08)] sm:p-8">
      <h2 className="m-0 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[28px] font-medium text-[#061948]">
        Register for this course
      </h2>

      {done ? (
        <div role="status" className="mt-5 rounded-lg border border-[#b7e0c2] bg-[#f1faf3] p-5">
          <p className="m-0 flex items-center gap-2 text-[16px] font-semibold text-[#1b7a3a]">
            <CircleCheck aria-hidden className="h-5 w-5" /> Registration received
          </p>
          <dl className="m-0 mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]">
            <dt className="text-[#4a5265]">Registration No.</dt>
            <dd className="m-0 font-mono font-semibold text-[#061948]">{done.registration_no}</dd>
            <dt className="text-[#4a5265]">Course</dt>
            <dd className="m-0 font-medium text-[#061948]">{done.course}</dd>
            <dt className="text-[#4a5265]">Status</dt>
            <dd className="m-0 font-medium text-[#bd7724]">Pending</dd>
          </dl>
          <p className="m-0 mt-4 text-[14.5px] leading-[1.65] text-[#3c4252]">
            Thank you, <strong className="font-semibold">{form.name.trim()}</strong>.{' '}
            {done.mailed && <>We have emailed these details to {form.email.trim()}. </>}
            Our team will call you on {form.mobile.trim()} to confirm the batch, the fees and admission.
          </p>
        </div>
      ) : (
        <>
          <p className="m-0 mt-2 text-[15px] leading-[1.7] text-[#4a5265]">
            Fill in your details. Your registration is saved as pending, and we email you the registration number.
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
              Registering for <span className="font-medium text-[#2c3b64]">{course}</span>. Your photograph, ID proof and
              qualification documents are collected when you visit.
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
              {sending ? 'Registering…' : 'Register now'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

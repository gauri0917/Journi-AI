"use client";

import { ButtonHTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    primary: "bg-route-600 text-white hover:bg-route-700",
    secondary: "bg-white text-ink border border-neutral-300 hover:border-route-500 hover:text-route-700",
    ghost: "text-neutral-600 hover:text-ink hover:bg-neutral-100",
    danger: "bg-white text-red-700 border border-red-200 hover:bg-red-50",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Label({ className = "", ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={`block text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1 ${className}`} {...props} />;
}

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-ink placeholder:text-neutral-400 focus:border-route-500 focus:outline-none focus:ring-2 focus:ring-route-100 ${className}`}
      {...props}
    />
  );
}

export function TextArea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-ink placeholder:text-neutral-400 focus:border-route-500 focus:outline-none focus:ring-2 focus:ring-route-100 ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-ink focus:border-route-500 focus:outline-none focus:ring-2 focus:ring-route-100 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Checkbox({ label, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={`inline-flex items-center gap-2 text-sm text-ink ${className}`}>
      <input type="checkbox" className="h-4 w-4 rounded border-neutral-300 text-route-600 focus:ring-route-300" {...props} />
      {label}
    </label>
  );
}

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-lg border border-neutral-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-700 border-neutral-300",
  in_review: "bg-amber-50 text-amber-800 border-amber-300",
  published: "bg-emerald-50 text-emerald-800 border-emerald-300",
  archived: "bg-neutral-100 text-neutral-500 border-neutral-300 line-through",
  pending: "bg-amber-50 text-amber-800 border-amber-300",
  reviewed: "bg-emerald-50 text-emerald-800 border-emerald-300",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${STATUS_STYLES[status] ?? "bg-neutral-100 text-neutral-700 border-neutral-300"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

// Marks a value the AI populated that the user hasn't touched yet — a small
// dashed-outline treatment plus label, used throughout the builder.
export function AiFlag({ children }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-dashed border-route-400 bg-route-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-route-700">
      ✦ AI draft{children ? `: ${children}` : ""}
    </span>
  );
}

export function ErrorList({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <p className="font-semibold mb-1">Fix the following:</p>
      <ul className="list-disc pl-5 space-y-0.5">
        {errors.map((e, i) => (
          <li key={i} className="font-mono text-xs">{e}</li>
        ))}
      </ul>
    </div>
  );
}

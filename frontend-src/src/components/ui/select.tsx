import * as React from "react";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  onValueChange?: (value: string) => void;
};

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ onValueChange, onChange, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        {...props}
        onChange={(e) => {
          onChange?.(e);
          onValueChange?.(e.target.value);
        }}
        className={[
          "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
          "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          props.className || "",
        ].join(" ")}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = "Select";

export function SelectItem(props: React.OptionHTMLAttributes<HTMLOptionElement>) {
  return <option {...props} />;
}

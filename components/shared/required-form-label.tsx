import { FormLabel } from "@/components/ui/form";
import { cn } from "@/lib/utils";

interface RequiredFormLabelProps extends React.ComponentProps<
  typeof FormLabel
> {
  required?: boolean;
}

/**
 * FormLabel with an optional red asterisk for required fields.
 */
export function RequiredFormLabel({
  required,
  children,
  className,
  ...props
}: RequiredFormLabelProps) {
  return (
    <FormLabel className={cn(className)} {...props}>
      {children}
      {required && (
        <span className="ml-0.5 text-destructive" aria-hidden="true">
          *
        </span>
      )}
    </FormLabel>
  );
}

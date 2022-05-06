import { Form, useSearchParams } from "@remix-run/react";

export function Login({ errors }: { errors?: { [k: string]: string } }) {
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/notes";

  return (
    <div className="flex min-h-full flex-col justify-center">
      <div className="mx-auto w-full max-w-md px-8">
        <Form method="post" className="space-y-6" action="/auth">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <button
            type="submit"
            className="w-full rounded bg-blue-500  py-2 px-4 text-white hover:bg-blue-600 focus:bg-blue-400"
          >
            Log in with Discord
          </button>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {Object.values(errors || {}).map((error) => (
                <p key={error} className="text-red-500">
                  {error}
                </p>
              ))}
            </div>
          </div>
        </Form>
      </div>
    </div>
  );
}

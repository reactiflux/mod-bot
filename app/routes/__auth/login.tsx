import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => {
  return [{ title: "Login" }];
};

export default function LoginPage() {
  // The actual auth logic is done in the __auth layout component, so if this
  // component is rendered, it worked 🚀
  return (
    <div className="flex min-h-full flex-col justify-center">
      <div className="mx-auto w-full max-w-md px-8">
        You have successfully signed in
      </div>
    </div>
  );
}

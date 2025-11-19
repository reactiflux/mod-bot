import fs from "fs";
import path from "path";
import { useLoaderData } from "react-router";

export async function loader() {
  // Read the Terms of Service markdown file
  const termsPath = path.join(process.cwd(), "TERMS_OF_SERVICE.md");
  const termsContent = fs.readFileSync(termsPath, "utf-8");

  return { termsContent };
}

export default function Terms() {
  const { termsContent } = useLoaderData<typeof loader>();

  // Simple markdown to HTML conversion for basic formatting
  const htmlContent = termsContent
    .split("\n")
    .map((line) => {
      // Headers
      if (line.startsWith("### ")) {
        return `<h3 class="text-lg font-semibold mt-6 mb-3 text-gray-900">${line.substring(4)}</h3>`;
      }
      if (line.startsWith("## ")) {
        return `<h2 class="text-2xl font-bold mt-8 mb-4 text-gray-900">${line.substring(3)}</h2>`;
      }
      if (line.startsWith("# ")) {
        return `<h1 class="text-3xl font-extrabold mb-6 text-gray-900">${line.substring(2)}</h1>`;
      }
      // Bold
      if (line.startsWith("**") && line.endsWith("**")) {
        return `<p class="font-semibold my-2 text-gray-700">${line.substring(2, line.length - 2)}</p>`;
      }
      // List items
      if (line.startsWith("- ")) {
        return `<li class="ml-4 my-1 text-gray-700">${line.substring(2)}</li>`;
      }
      // All caps paragraphs (disclaimers)
      if (line === line.toUpperCase() && line.length > 10) {
        return `<p class="font-bold my-3 text-gray-900">${line}</p>`;
      }
      // Regular paragraphs
      if (line.trim()) {
        return `<p class="my-2 text-gray-700">${line}</p>`;
      }
      return "";
    })
    .join("\n");

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-lg bg-white px-6 py-8 shadow-sm sm:px-10">
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        </div>
        <div className="mt-6 text-center">
          <a href="/" className="text-sm text-indigo-600 hover:text-indigo-500">
            ← Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}

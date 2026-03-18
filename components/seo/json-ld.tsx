/**
 * JSON-LD Server Components
 *
 * Renders structured data as <script type="application/ld+json"> tags.
 * All components are Server Components (no 'use client').
 *
 * Requirements: 5.1, 5.2, 5.3, 5.5, 5.6
 */

import React from "react";

export interface WebSiteProps {
  url: string;
  name: string;
  description?: string;
}

export interface OrgProps {
  url: string;
  name: string;
  logo?: string;
  sameAs?: string[];
}

export interface WebPageProps {
  url: string;
  name: string;
  description?: string;
}

/**
 * Generic JSON-LD component — renders any schema as a
 * <script type="application/ld+json"> tag.
 */
export function JsonLd({
  schema,
}: {
  schema: Record<string, unknown>;
}): React.JSX.Element {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

/** WebSite structured data schema. */
export function WebSiteJsonLd({
  url,
  name,
  description,
}: WebSiteProps): React.JSX.Element {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url,
    ...(description !== undefined && { description }),
  };
  return <JsonLd schema={schema} />;
}

/** Organization structured data schema. */
export function OrganizationJsonLd({
  url,
  name,
  logo,
  sameAs,
}: OrgProps): React.JSX.Element {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name,
    url,
    ...(logo !== undefined && { logo }),
    sameAs: sameAs ?? [],
  };
  return <JsonLd schema={schema} />;
}

/** WebPage structured data schema. */
export function WebPageJsonLd({
  url,
  name,
  description,
}: WebPageProps): React.JSX.Element {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name,
    ...(description !== undefined && { description }),
    url,
  };
  return <JsonLd schema={schema} />;
}

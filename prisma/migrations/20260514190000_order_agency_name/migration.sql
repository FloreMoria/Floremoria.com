-- Partner B2B: identificativo agenzia lato integratore (es. AnnunciFunebri) su ogni ordine.
ALTER TABLE "Order" ADD COLUMN "agency_name" VARCHAR(255);

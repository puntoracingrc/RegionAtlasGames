import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Los planes de pago están desactivados; todas las funciones ya están disponibles.",
    },
    { status: 410 },
  );
}

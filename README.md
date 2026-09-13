# Shuk

> Tu negocio, en un solo lugar.

Shuk es una aplicación web para administrar productos, inventario, clientes, ventas y ganancias. Está pensada para pequeños negocios y separa por completo la información de cada cuenta mediante Supabase Auth y Row Level Security (RLS).

## Funcionalidades

- Registro, inicio y cierre de sesión con correo y contraseña.
- Datos aislados por usuario: una cuenta no puede ver ni modificar los datos de otra.
- Catálogo de productos con imagen, proveedor, categoría, precios y stock.
- Carga de lotes de inventario y cálculo de stock mediante FIFO.
- Gestión de clientes.
- Creación, edición, cancelación y eliminación de ventas.
- Total dinámico mientras se prepara una venta.
- Registro de consumos por lote para conservar el costo real de cada venta.
- Panel de ganancias por período, cliente y producto.
- Importación y exportación de productos en Excel.
- Exportación de comprobantes de venta en PDF.
- Interfaz adaptable a escritorio y celular.

## Tecnologías

- React 19 + Vite
- React Router
- Supabase (PostgreSQL, Auth y RLS)
- jsPDF
- SheetJS (`xlsx`)

## Requisitos

- Node.js 20 o posterior
- Una cuenta y proyecto de Supabase

## Instalación local

```bash
npm install
npm run dev
```

Vite mostrará la dirección local, normalmente `http://localhost:5173`.

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Inicia el servidor de desarrollo. |
| `npm run build` | Genera la versión optimizada en `dist/`. |
| `npm run preview` | Previsualiza el build de producción. |
| `npm run lint` | Ejecuta las verificaciones de código. |

## Configuración de Supabase

La conexión está configurada en `src/supabaseClient.js`. Para usar otro proyecto, reemplazá la URL y la clave pública por las de tu instancia de Supabase.

> Nunca agregues una `service_role key` al frontend. Sólo debe usarse la clave pública/anon o publishable.

En **Authentication → Providers**, verificá que Email esté habilitado. En **Authentication → URL Configuration**, agregá la URL de producción de la app en:

- `Site URL`
- `Redirect URLs`

Esto permite que la confirmación por correo redirija correctamente a Shuk.

## Base de datos y migraciones

Las migraciones se ejecutan en el SQL Editor de Supabase, en este orden:

1. `db/migrations/20260907_stock_fifo.sql`
2. `db/migrations/20260909_permitir_ventas_sin_stock.sql`
3. `db/migrations/20260910_actualizar_ventas_fifo.sql`
4. `db/migrations/20260913_multiusuario_auth.sql`

La última migración habilita el sistema multiusuario. Antes de ejecutarla:

1. Creá y confirmá la cuenta que recibirá los datos históricos.
2. En `20260913_multiusuario_auth.sql`, reemplazá el correo de ejemplo por el correo exacto de esa cuenta.
3. Ejecutá el archivo completo, sin fragmentarlo.

La migración añade `owner_id` a todas las tablas, asigna los registros existentes a la cuenta indicada y activa políticas RLS. Los nuevos registros quedan automáticamente asociados a la sesión que los crea.

## Modelo de datos

```text
Clientes ──< Ventas ──< DetalleVentas ──< ConsumosLote >── LotesStock >── Productos
                         └────────────────> Productos
```

| Tabla | Propósito |
| --- | --- |
| `Clientes` | Datos de los clientes. |
| `Productos` | Catálogo, precio, proveedor, categoría y stock total. |
| `LotesStock` | Entradas de inventario, costos y disponibilidad por lote. |
| `Ventas` | Cabecera de cada operación. |
| `DetalleVentas` | Productos, cantidades y precios de cada venta. |
| `ConsumosLote` | Relación entre una venta y los lotes consumidos para el cálculo FIFO. |

## Seguridad

- La interfaz se bloquea hasta que exista una sesión válida.
- Supabase RLS limita cada tabla al `owner_id` del usuario autenticado.
- Las funciones que alteran ventas e inventario sólo se pueden ejecutar con una cuenta autenticada.
- Las relaciones entre clientes, productos, lotes, ventas y detalles también se validan dentro de las políticas de seguridad.

## Identidad visual

- Nombre: **Shuk**
- Logo: `src/assets/Shuk-logo.png`
- La paleta de la interfaz toma como base los tonos azul marino, azul y celeste del logo.

## Publicación

Podés desplegar el proyecto en Vercel, Netlify o cualquier hosting estático compatible con Vite.

1. Subí el repositorio a GitHub.
2. Importalo desde el servicio de hosting.
3. Usá `npm run build` como comando de build.
4. Indicá `dist` como directorio de publicación.
5. Agregá la URL resultante a la configuración de redirecciones de Supabase Auth.

Luego podés incluir la URL pública como proyecto en LinkedIn.

## Estado del proyecto

Antes de publicar, ejecutá:

```bash
npm run lint
npm run build
```

Ambos comandos deben finalizar sin errores.

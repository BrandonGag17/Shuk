# Shuk

Aplicación web para que pequeños negocios administren su inventario, clientes, ventas y ganancias desde un solo lugar.

## Qué permite hacer

- Crear y organizar productos, con precios, proveedor, categoría e imagen.
- Registrar entradas de stock por lote y descontarlo automáticamente al vender.
- Crear clientes y consultar su historial de compras.
- Armar ventas, editarlas o cancelarlas, y exportar su comprobante en PDF.
- Ver ganancias por período, producto o cliente.
- Importar y exportar el catálogo de productos en Excel.

## Cómo funciona

1. La persona crea una cuenta o inicia sesión con su correo.
2. Carga sus productos y, si corresponde, el stock disponible.
3. Registra clientes y genera ventas seleccionando productos y cantidades.
4. Shuk actualiza el inventario y conserva el costo de cada venta para calcular las ganancias.

Los datos de cada cuenta están separados: un usuario solo puede consultar y modificar su propia información.

## Pantallas y rutas

Todas las rutas requieren una sesión iniciada. Si no existe, se muestra la pantalla de acceso.

| Ruta | JSX | Qué hace |
| --- | --- | --- |
| `/` | `Productos.jsx` | Inicio de la app. Muestra el catálogo de productos, permite buscar, filtrar por categoría, abrir el detalle y acceder a la creación o importación/exportación de productos. |
| `/producto/:id` | `DetalleProducto.jsx` | Muestra un producto, sus lotes de stock y precios. Permite editarlo, sumar un lote de inventario o eliminarlo si no tiene ventas asociadas. |
| `/crear-producto` | `CrearProducto.jsx` | Formulario para dar de alta un producto; valida que no exista otro con el mismo nombre. |
| `/clientes` | `Clientes.jsx` | Lista los clientes y permite ir a su detalle o crear uno nuevo. |
| `/cliente/:id` | `DetalleCliente.jsx` | Consulta, edita o elimina un cliente. No permite eliminarlo si tiene ventas asociadas. |
| `/crear-cliente` | `CrearCliente.jsx` | Formulario para registrar un cliente y validar duplicados o correo electrónico. |
| `/ventas` | `Ventas.jsx` | Lista las ventas, permite filtrarlas por cliente y producto, crear una venta o eliminar una existente. |
| `/venta/:id` | `DetalleVenta.jsx` | Muestra los renglones y el estado de una venta. Permite editar productos, cantidades, precios y estado, además de descargar el comprobante en PDF. |
| `/crear-venta` | `CrearVenta.jsx` | Arma una venta: se elige un cliente, se buscan productos, se ajustan cantidades o precios y se calcula el total antes de confirmarla. |
| `/ganancias` | `Ganancias.jsx` | Calcula ingresos, costos y ganancia neta para un período, con filtros opcionales por cliente y producto. También desglosa el resultado por producto. |
| `/importar-productos` | `ImportarProductos.jsx` | Lee un archivo Excel, muestra una vista previa e importa productos y su stock inicial. Permite deshacer esa importación mientras se está en la pantalla. |
| `/exportar-productos` | `ExportarProductos.jsx` | Permite elegir productos y columnas para descargar un archivo Excel personalizado. |

## Otros JSX relevantes

| Archivo | Función |
| --- | --- |
| `main.jsx` | Punto de entrada: monta la aplicación React y carga los estilos globales. |
| `App.jsx` | Controla la sesión, muestra el acceso cuando corresponde y define todas las rutas anteriores. |
| `Auth.jsx` | Pantalla de inicio de sesión y registro con correo y contraseña. |
| `Header.jsx` | Barra de navegación principal, muestra la cuenta actual y permite cerrar sesión. |
| `FiltroProductos.jsx` | Componente reutilizable para buscar, filtrar por categoría y seleccionar productos; se usa en Ventas y Ganancias. |
| `LoadingIndicator.jsx` | Indicador global que aparece durante las consultas a Supabase. |

## Tecnologías

React + Vite en el frontend y Supabase para autenticación y base de datos. También utiliza SheetJS para Excel y jsPDF para comprobantes.

## Ejecutarlo localmente

Requiere Node.js 20 o superior.

```bash
npm install
npm run dev
```

Abrí la dirección que indique Vite (normalmente `http://localhost:5173`).

## Comandos útiles

```bash
npm run build  # genera la versión de producción
npm run lint   # revisa el código
```

## Base de datos

El esquema y las migraciones de Supabase están en [`db/migrations`](db/migrations). Para una instalación nueva, ejecutalas en el SQL Editor de Supabase en orden cronológico.

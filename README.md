# K Propiedades · app

App web instalable (PWA) y open source para guardar y ver desde el celular las propiedades, propietarios, clientes, fotos (con y sin marca de agua), videos y documentos de K Propiedades.

## Qué hace
- **Inicio**: panel con propiedades activas, en captación, cierres del mes, postventas pendientes, tareas de hoy y gráficos de captaciones y cierres por mes.
- **Agenda**: semana con visitas, captaciones, llamadas y firmas; se pueden agregar a Google Calendar.
- **Propiedades**: datos (rol, m², precio en CLP o UF, gastos comunes, contribuciones), búsqueda y filtro.
- **Estado del proceso**: Captar, Captada, Disponible, Negociando, Arrendada o Vendida. Solo Disponible y Negociando aparecen en la vitrina. Al arrendar o vender aparece una ⭐ de **postventa** con su lista de pasos; la estrella se quita cuando todos están listos.
- **Fotos**: desde la cámara o la galería. Al agregarlas crea sola la versión con el logo abajo a la derecha.
- **Videos**: grabados o desde la galería, listos para compartir a Instagram, Facebook, TikTok o WhatsApp. El logo se agrega como sticker al publicar (descargable en la app).
- **Documentos**: actas de toma de razón, fotos de medidores, contratos, promesas, órdenes de corretaje (fotos o PDF).
- **Personas**: propietarios, arrendatarios, compradores e interesados, con botón de llamar y WhatsApp.
- **Publicar**: botón Compartir que envía las fotos con marca y el texto del aviso ya redactado.
- **Newsletter para LinkedIn**: botón en Propiedades que arma el texto del período (nuevas, bajas de precio, arrendadas/vendidas) con links a la vitrina, para copiar o compartir.
- **Vitrina pública** (`/vitrina/`): página para clientes con las propiedades disponibles o en negociación. Solo muestra datos públicos (fotos con marca, precio, m², comuna, descripción) y botón de WhatsApp. Se actualiza desde la app con "Publicar en vitrina".
- **Sin conexión**: todo queda guardado en el celular. Se recomienda descargar un respaldo semanal y subirlo a Google Drive.

## Cómo publicarla (GitHub Pages)
1. Subir estos archivos a la raíz del repositorio.
2. En GitHub: Settings → Pages → Deploy from a branch → `main` / root.
3. Abrir el link en Chrome desde el celular y tocar **Agregar a la pantalla de inicio** (o Ajustes → Instalar).

Sin dependencias ni compilación: HTML, CSS y JavaScript puros.

## Llave para publicar la vitrina
La app publica la vitrina en este repositorio usando una llave (token) de GitHub que se guarda solo en el celular y no se incluye en los respaldos.

1. Entrar a https://github.com/settings/personal-access-tokens/new
2. Nombre: `Vitrina K Propiedades`. Vencimiento: 1 año.
3. Repository access: **Only select repositories** → `k-propiedades-app`.
4. Permissions → Repository permissions → **Contents: Read and write**.
5. **Generate token**, copiarla y pegarla en la app: Ajustes → Vitrina pública → Guardar llave.

# Arriendo con Cita

Ficha de inmueble con prefiltro de requisitos y agenda de visitas, para propietarios que arriendan directo y para quien quiere ceder su contrato de arriendo. Beta para Madrid, Cundinamarca y la Sabana.

## Cómo funciona

- **`index.html`**: el propietario crea la ficha (canon, administración, garantías, requisitos, mascotas, horarios). Recibe dos enlaces: la ficha pública y su panel privado.
- **`ver.html?a=<slug>`**: ficha pública. El interesado ve las respuestas, llena el prefiltro (ingresos, garantía, reportes autodeclarados, titular, mascotas, mudanza) y, si cumple, agenda la visita.
- **`panel.html#<slug>.<token>`**: panel privado del propietario. Ve visitas, escribe por WhatsApp, marca asistencia, ve motivos de descarte y edita la ficha.
- **Fotos**: hasta 8 por inmueble. Se reducen en el celular (máx. 1600 px, JPEG, sin GPS) y se suben con una URL firmada que entrega la función de borde `supabase/functions/fotos`, que valida el enlace del dueño.
- **`privacidad.html`**: términos y política de datos (borrador; completar el correo de contacto y revisar con un abogado).

Es un sitio estático (HTML, CSS y JavaScript sin compilación) que habla con Supabase mediante `supabase-js`.

## Backend (Supabase)

Proyecto `arriendo-con-cita` (región us-east-1). El esquema está en `supabase/migrations/`.

- Sin cuentas en la beta: el panel se abre con un token aleatorio cuyo hash se guarda en `private.property_tokens`.
- Las citas y los descartados no son legibles con la clave pública; solo se acceden mediante funciones que validan requisitos, franjas, fecha y consentimiento.
- Un índice único impide que dos personas reserven la misma hora.
- A quien no cumple no se le guardan datos personales, solo el motivo.
- La clave de `assets/config.js` es la clave pública (anon). Nunca subas la clave `service_role`.

## Publicar con GitHub Pages

1. En el repositorio: **Settings → Pages**.
2. En *Build and deployment*, elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`, y guarda.
3. En un par de minutos queda en `https://<usuario>.github.io/arriendo-con-cita/`.

## Pendientes antes de abrir al público

- [ ] Revisar `privacidad.html` con un abogado y cambiar el correo personal por uno del proyecto.
- [ ] Aplicar `20261018_limpieza_automatica.sql` (borrado automático de datos antiguos).
- [ ] Quitar la extensión `pg_net`, instalada solo para probar la función de fotos.
- [ ] Borrar las fotos del almacenamiento cuando se elimine una ficha.
- [ ] Recordatorios de visita por WhatsApp y límite de solicitudes para evitar spam.
- [ ] Inicio de sesión con correo para propietarios con varios inmuebles.

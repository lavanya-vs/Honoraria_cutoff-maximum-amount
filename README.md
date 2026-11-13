# Honoraria cutoff (max)

Optional maximum amount per business line on the Honoraria Process tab (Fulfillments table).

## Apply over IQVIATools

Copy each path into the matching location in the main IQVIATools tree:

- `src/main/webapp/WEB-INF/views/tools/honoraria/honoraria-main.jsp`
- `src/main/webapp/resources/css/tools/honoraria.css`
- `src/main/webapp/resources/js/tools/honoraria/honoraria.js`
- `src/main/java/com/iqvia/tools/Honoraria/HonorariaController.java`
- `src/main/java/com/iqvia/tools/Honoraria/HonorariaService.java`
- `src/main/java/com/iqvia/tools/shared/dao/Honoraria/HonorariaRepositoryDAO.java`

Blank **Optional** cutoff → full amount. Value ≤ amount → max cap sent to Oracle `generateFulfillmentBatches`.

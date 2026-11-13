package com.iqvia.tools.Honoraria;


import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import com.iqvia.tools.shared.dao.Honoraria.AdpStaleCheckFilesDAO;
import com.iqvia.tools.shared.dao.Honoraria.HonorariaReportDAO;
import com.iqvia.tools.shared.dao.Honoraria.HonorariaRepositoryDAO;
import com.iqvia.tools.shared.dao.Honoraria.HonorariaTypesDAO;
import com.iqvia.tools.shared.dao.Honoraria.QualHonorariaDAO;
import com.iqvia.tools.shared.dao.Reference.CodeDAO;
import com.iqvia.tools.shared.model.AccountingSchema.HonorariaByCellReport;
import com.iqvia.tools.shared.model.AccountingSchema.HonorariaLatencyReport;
import com.iqvia.tools.shared.model.AccountingSchema.HonorariaStatusSummaryReport;
import com.iqvia.tools.shared.model.AccountingSchema.HonorariaSummaryReportResult;
import com.iqvia.tools.shared.model.AccountingSchema.MonthlyHonorariaReport;
import com.iqvia.tools.shared.model.AccountingSchema.ProgramEventOption;
import com.iqvia.tools.shared.model.ReferenceSchema.Code;
import com.iqvia.tools.shared.model.AccountingSchema.AdpStaleCheckFileDetail;
import com.iqvia.tools.shared.model.AccountingSchema.AdpStaleCheckFiles;
import com.iqvia.tools.shared.model.AccountingSchema.CheckRepository;
import com.iqvia.tools.shared.model.AccountingSchema.HonorariaSearchResult;
import com.iqvia.tools.shared.model.AccountingSchema.OpenIncompleteCurResult;
import com.iqvia.tools.shared.model.EventSchema.ActivityHonoraria;
import com.iqvia.tools.shared.model.EventSchema.HonorariaType;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Date;
import java.util.Iterator;
import java.util.List;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.jboss.logging.Logger;

import javax.servlet.http.HttpSession;


@Component
public class HonorariaService {
	@Autowired private HonorariaRepositoryDAO honorariaDAO;
	@Autowired private HonorariaReportDAO honorariaReportDAO;
	@Autowired private AdpStaleCheckFilesDAO adpStaleCheckFilesDAO;
	@Autowired private HonorariaTypesDAO honorariaTypesDAO;
	@Autowired private QualHonorariaDAO qualHonorariaDAO;
	@Autowired private CodeDAO codeDAO;
	
	
	private static final Logger logger = Logger.getLogger(HonorariaService.class);
	private static String rootPath = System.getProperty("jboss.server.data.dir");

	private static final String excelFileRootPath = rootPath + File.separator + "excelFiles" + File.separator + "checks";

	private java.sql.Date normalizeDueDate(String dueDate, String context) {
		if (dueDate == null || dueDate.trim().isEmpty()) {
			logger.info(context + ": dueDate was blank/null; defaulting to today.");
			return new java.sql.Date(System.currentTimeMillis());
		}
		try {
			Date inDate = new SimpleDateFormat("MM/dd/yyyy").parse(dueDate.trim());
			return new java.sql.Date(inDate.getTime());
		} catch (ParseException e) {
			logger.error(context + ": Error parsing date: " + dueDate + ", must be in form: MM/dd/yyyy; defaulting to today.", e);
			return new java.sql.Date(System.currentTimeMillis());
		}
	}
	
	public HonorariaSearchResult getUnprocessedHonoraria(String fulfillmentMethod, String paymentTypeGroup, String dueDate) {
		java.sql.Date sqlDate = normalizeDueDate(dueDate, "getUnprocessedHonoraria");
		return honorariaDAO.searchUnprocessed(fulfillmentMethod, paymentTypeGroup, sqlDate);
	}

	
	public HonorariaSearchResult getEanredHonoraria(String fulfillmentMethod, String paymentTypeGroup,	String dueDate) {
		java.sql.Date sqlDate = normalizeDueDate(dueDate, "getEarnedHonoraria");
		return honorariaDAO.searchEarned(fulfillmentMethod, paymentTypeGroup, sqlDate);
	}

	
	// paymentTypeFilter is inFulfillmentMethod (CHECK, AMAZON)
	// programTypeFilter is inPaymentTypeGroup (All, EDC, Survey)
	public HonorariaSearchResult generateFulfillmentBatch(String fulfillmentMethod, String paymentTypeGroup, String dueDate, long inBusinessLineId, String inUser) {
		java.sql.Date sqlDate = normalizeDueDate(dueDate, "generateFulfillmentBatch");
		
		// PL/SQL is: generateFulfillmentBatch(String inDisposition, java.sql.Date inDueDate, String inPaymentTypeGroup, String inFulfillmentMethod, String inUser, long inBusinessLineId)
		return honorariaDAO.generateFulfillmentBatch(fulfillmentMethod, paymentTypeGroup, sqlDate, inUser, inBusinessLineId);
	}
	
	
	public HonorariaSearchResult generateFulfillmentBatches(
			String fulfillmentMethod,
			String paymentTypeGroup,
			String dueDate,
			String inUser,
			long[] businessLineIds,
			String[] batchCutoffAmounts) {
		java.sql.Date sqlDate = normalizeDueDate(dueDate, "generateFulfillmentBatches");

		Long[] cutoffAmounts = parseOptionalCutoffAmounts(batchCutoffAmounts);
		boolean useCutoffArrays = cutoffAmounts != null;

		if (useCutoffArrays) {
			if (businessLineIds == null || businessLineIds.length == 0) {
				logger.error("generateFulfillmentBatches: batchCutoffAmounts provided without businessLineIds");
				return new HonorariaSearchResult();
			}
			if (businessLineIds.length != cutoffAmounts.length) {
				logger.error("generateFulfillmentBatches: businessLineIds length " + businessLineIds.length
						+ " does not match batchCutoffAmounts length " + cutoffAmounts.length);
				return new HonorariaSearchResult();
			}
		}

		return honorariaDAO.generateFulfillmentBatches(
				fulfillmentMethod,
				paymentTypeGroup,
				sqlDate,
				inUser,
				useCutoffArrays ? businessLineIds : null,
				useCutoffArrays ? cutoffAmounts : null);
	}

	private static Long[] parseOptionalCutoffAmounts(String[] batchCutoffAmounts) {
		if (batchCutoffAmounts == null || batchCutoffAmounts.length == 0) {
			return null;
		}
		Long[] result = new Long[batchCutoffAmounts.length];
		boolean anyPresent = false;
		for (int i = 0; i < batchCutoffAmounts.length; i++) {
			String raw = batchCutoffAmounts[i];
			if (raw == null || raw.trim().isEmpty()) {
				result[i] = null;
			} else {
				anyPresent = true;
				try {
					result[i] = Long.valueOf(raw.trim());
				} catch (NumberFormatException e) {
					return null;
				}
			}
		}
		return anyPresent ? result : null;
	}


	public List<CheckRepository> getChecksByNumber(String checkNo) {
		return honorariaDAO.getChecksByNumber(checkNo);
	}

	public List<CheckRepository> getChecksByTargetrxId(Long trxid) {
		return honorariaDAO.getChecksByTargetrxId(trxid);
	}

	public List<CheckRepository> getChecksByDates(String fromDate, String toDate) {
		return honorariaDAO.getChecksByDates(fromDate, toDate);
	}

	public List<AdpStaleCheckFiles> getStaleCheckFiles() {
		return honorariaDAO.getStaleCheckFiles();
	}

	public List<AdpStaleCheckFileDetail> getStaleCheckFileDetails(int fileId) {
		return honorariaDAO.getStaleCheckFileDetails(fileId);
	}

	public String uploadFile(MultipartFile file, HttpSession session) {
		String name = null;
		String retMsg = "";
		
		name = file.getOriginalFilename();
		logger.info("uploadFile entering - Upload filename: " + name + ", size=" + file.getSize() + ", updUser=" + session.getAttribute("userFullName"));

		if (!file.isEmpty()) {			
			try {
				File dir = new File(excelFileRootPath);
				if (!dir.exists())
					dir.mkdirs();

				File serverFile = new File(dir.getAbsolutePath() + File.separator + name);
				copyFileUsingStream(file, serverFile);
				
				logger.info("File uploaded, server File Location="	+ serverFile.getAbsolutePath());	
				retMsg = serverFile.getAbsolutePath();
			} catch (Exception e) {
				logger.error(e.getMessage() + ", updUser=" + session.getAttribute("userFullName"), e);
				retMsg = "Error: " + e.getMessage();
			}
		} else {
			logger.info("You failed to upload " + name + " because the file was empty. user="+session.getAttribute("userFullName"));
			retMsg = "You failed to upload " + name + " because the file was empty.";
		}				
		
		return retMsg;
	}

	
	private static void copyFileUsingStream(MultipartFile source, File dest) throws IOException {
	    try (InputStream is = source.getInputStream();
	         OutputStream os = new FileOutputStream(dest)) {
	        byte[] buffer = new byte[1024];
	        int length;
	        while ((length = is.read(buffer)) > 0) {
	            os.write(buffer, 0, length);	            
	        }
	    }
	}

	
	public String addCheckByNumber(String[] allCheckNumbers, String user) {
		Integer fileId = adpStaleCheckFilesDAO.addFile("Check numbers were typed in", user);
		
		if (fileId != null) {
			logger.info("addCheckByNumber: Created new file record with fileId=" + fileId);
			return adpStaleCheckFilesDAO.addCheckByNumber(fileId, allCheckNumbers, user);
		} else {
			logger.error("addCheckByNumber: Could not create new file record, fileId is null.");
			return "Failed to create new file record for check numbers.";			
		}
		
	}

	
	public String addCheckByFile(String fileName, String userName) {
		List<String> checkList = new ArrayList<String>();
		logger.info("addCheckByFile: fileName=" + fileName + ", userName=" + userName);

		try {
			String completeFilePath = excelFileRootPath + File.separator  + fileName;

			try (FileInputStream file = new FileInputStream(completeFilePath);
					XSSFWorkbook workbook = new XSSFWorkbook(file)) {

				// Get first/desired sheet from the workbook
				XSSFSheet sheet = workbook.getSheetAt(0);

				// Iterate through each rows one by one
				Iterator<Row> rowIterator = sheet.iterator();
				String val = null;

				while (rowIterator.hasNext()) {
					Row row = rowIterator.next();
					Iterator<Cell> cellIterator = row.cellIterator();

					while (cellIterator.hasNext()) {
						val = null;
						Cell cell = cellIterator.next();
						// Check the cell type and format accordingly
						switch (cell.getCellType()) {
						case NUMERIC:
							double dval = cell.getNumericCellValue();
							int i = (int)dval;
							val = i + "";
							break;
						case STRING:
							val = cell.getStringCellValue();
							break;
						default:
							break;
						}

						if (val != null) {
							checkList.add(val);
							logger.info(val);
						}
					}
				}
			}
		} catch (Exception e) {
			logger.error("addCheckByFile: ERROR", e);
			e.printStackTrace();
		}

		Integer fileId = adpStaleCheckFilesDAO.addFile(fileName, userName);
		logger.info("addCheckByFile: Created new file record with fileId=" + fileId + ", total checks=" + checkList.size());
		
		if (fileId == null) {
			logger.error("addCheckByFile: Could not create new file record, fileId is null.");
			return "Failed to create new file record for check numbers.";			
		}
		
		return adpStaleCheckFilesDAO.addCheckByNumber(fileId, checkList.toArray(new String[0]), userName);
	}

	public List<ActivityHonoraria> getActivityHonoraria(Long programId) {
		return honorariaDAO.getActivityHonorariaByProgram(programId);
	}

	public List<HonorariaType> getHonorariaTypesByTrigger(String paymentTriggerTypeCode) {
		return honorariaTypesDAO.getHonorariaTypesByTrigger(paymentTriggerTypeCode);
	}
	
	public int saveApprovedAmount(String approvalRecs) {
		Authentication auth = SecurityContextHolder.getContext().getAuthentication();
	    String user = auth.getName();
	    
	    String[] recs = approvalRecs.split(",");
	    int successCnt = 0;
	    for (String rec : recs) {
	    	String[] parts = rec.split("~");
	    	if (parts.length == 2) {
	    		logger.info("saveApprovedAmount: logRecordId="+parts[0]+", honTypeCode="+parts[1]);
	    		Long logRecordId = Long.parseLong(parts[0]);
	    		String honTypeCode = parts[1];
	    		if (qualHonorariaDAO.saveApprovedAmount(logRecordId, honTypeCode, user)) {
	    			successCnt++;
	    		}
	    	}
	    }
	    
	    return successCnt;
	}

	public boolean runLoopback(long batchId, String user, String orderNumber) {
		return honorariaDAO.runLoopback(batchId, user, orderNumber);
	}

	public boolean generateFile(long batchId, String user, String proposedFulfillmentDate) {
		java.sql.Date sqlDate = parseProposedFulfillmentDate(proposedFulfillmentDate);
		return honorariaDAO.generateFile(batchId, user, sqlDate);
	}

	public boolean generateFiles(String[] batchIds, String user, String proposedFulfillmentDate) {
		java.sql.Date sqlDate = parseProposedFulfillmentDate(proposedFulfillmentDate);
		return honorariaDAO.generateFiles(batchIds, user, sqlDate);
	}

	private java.sql.Date parseProposedFulfillmentDate(String proposedFulfillmentDate) {
		if (proposedFulfillmentDate == null || proposedFulfillmentDate.trim().isEmpty()) {
			return null;
		}
		try {
			Date inDate = new SimpleDateFormat("MM/dd/yyyy").parse(proposedFulfillmentDate.trim());
			return new java.sql.Date(inDate.getTime());
		} catch (ParseException e) {
			logger.error("parseProposedFulfillmentDate: must be MM/dd/yyyy, got: " + proposedFulfillmentDate, e);
			return null;
		}
	}


	public OpenIncompleteCurResult checkForIncompleteBatch() {
		return honorariaDAO.checkForIncompleteBatch();
	}

	public List<Code> getHonorariaDispositionCodes() {
		List<Code> codes = codeDAO.getHonorariaCodes("HONORARIA_DISPOSITION");
		codes.sort(Comparator.comparing(
				code -> code.getShortName(),
				Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER)));
		return codes;
	}

	public List<ProgramEventOption> getProgramEvents(long programEventId) {
		return honorariaReportDAO.getProgramEvents(programEventId);
	}

	public HonorariaSummaryReportResult searchHonorariaSummary(Long targetrxId, String approvedAmount,
			String startDate, String endDate, Long programEventId, Long eventId, String honorariaStatus,
			boolean manualOnly, String sortBy) {
		BigDecimal amount = null;
		if (approvedAmount != null && !approvedAmount.trim().isEmpty()) {
			try {
				amount = new BigDecimal(approvedAmount.trim());
			} catch (NumberFormatException e) {
				logger.warn("searchHonorariaSummary: invalid approvedAmount=" + approvedAmount);
			}
		}
		return honorariaReportDAO.searchHonorariaSummary(targetrxId, amount, startDate, endDate,
				programEventId, eventId, honorariaStatus, manualOnly, sortBy);
	}

	public HonorariaStatusSummaryReport getStatusSummaryReport() {
		HonorariaStatusSummaryReport report = new HonorariaStatusSummaryReport();
		report.setUnprocessedRows(honorariaReportDAO.getStatusGroupedByDisposition("UNPR"));
		report.setApprovedRows(honorariaReportDAO.getStatusGroupedByDisposition("PROC"));
		report.setFulfillTotals(honorariaReportDAO.getFulfillTotals());
		report.setApprovePaymentRows(honorariaReportDAO.getFulfillmentAmountSummary("PEND", false, false));
		report.setAssignChecksRows(honorariaReportDAO.getFulfillmentAmountSummary("APRV", true, false));
		report.setSolomonRows(honorariaReportDAO.getSolomonFulfillmentSummary());
		report.setApproveInventoryRows(honorariaReportDAO.getFulfillmentAmountSummary("PEND", false, true));
		report.setMailRows(honorariaReportDAO.getFulfillmentAmountSummary("APRV", false, true));
		report.setPrintableRows(honorariaReportDAO.getFulfillmentAmountSummary("PRINTABLE", false, true));
		report.setPrintedRows(honorariaReportDAO.getFulfillmentAmountSummary("PRINTED", false, true));
		return report;
	}

	public MonthlyHonorariaReport getMonthlyHonorariaReport(String startDate, String endDate) {
		MonthlyHonorariaReport report = new MonthlyHonorariaReport();
		report.setEarnedRows(honorariaReportDAO.getMonthlyEarnedHonoraria(startDate, endDate));
		report.setEarnedAndPaidRows(honorariaReportDAO.getMonthlyEarnedAndPaidHonoraria(startDate, endDate));
		report.setEarnedAndUnpaidRows(honorariaReportDAO.getMonthlyEarnedAndUnpaidHonoraria(startDate, endDate));
		report.setOtherPaidRows(honorariaReportDAO.getMonthlyOtherPaidProjects(startDate, endDate));
		report.setOtherCheckRows(honorariaReportDAO.getMonthlyOtherCheckPayments(startDate, endDate));
		return report;
	}

	public List<Integer> getDistinctCellNumbers(List<Long> programEventIds) {
		return honorariaReportDAO.getDistinctCellNumbers(programEventIds);
	}

	public HonorariaByCellReport getHonorariaByCellReport(List<Long> programEventIds, List<Integer> activeCells) {
		return honorariaReportDAO.getHonorariaByCellReport(programEventIds, activeCells);
	}

	public HonorariaLatencyReport getHonorariaLatencyReport(String startDate, String endDate) {
		HonorariaLatencyReport report = new HonorariaLatencyReport();
		report.setLatencyRows(honorariaReportDAO.getHonorariaLatency(startDate, endDate));
		report.setReissues(honorariaReportDAO.getReissueSummary(startDate, endDate));
		report.setManualPaid(honorariaReportDAO.getManualPaidSummary(startDate, endDate));
		report.setUnpaidAgeRows(honorariaReportDAO.getUnpaidByAge(startDate, endDate));
		return report;
	}

}


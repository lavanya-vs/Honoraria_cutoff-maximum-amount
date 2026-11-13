package com.iqvia.tools.Honoraria;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;
import javax.servlet.http.HttpSession;

import org.jboss.logging.Logger;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.multipart.MultipartFile;

import com.iqvia.tools.shared.model.LDAPPerson;
import com.iqvia.tools.shared.model.AccountingSchema.AdpStaleCheckFileDetail;
import com.iqvia.tools.shared.model.AccountingSchema.AdpStaleCheckFiles;
import com.iqvia.tools.shared.model.AccountingSchema.CheckRepository;
import com.iqvia.tools.shared.model.AccountingSchema.HonorariaSearchResult;
import com.iqvia.tools.shared.model.AccountingSchema.OpenIncompleteCurResult;
import com.iqvia.tools.shared.model.EventSchema.ActivityHonoraria;
import com.iqvia.tools.shared.model.EventSchema.HonorariaType;
import com.iqvia.tools.shared.service.SharedServices;
import com.iqvia.tools.shared.utility.PropertyUtil;
import com.iqvia.tools.shared.model.AccountingSchema.HonorariaByCellReport;
import com.iqvia.tools.shared.model.AccountingSchema.HonorariaLatencyReport;
import com.iqvia.tools.shared.model.AccountingSchema.HonorariaStatusSummaryReport;
import com.iqvia.tools.shared.model.AccountingSchema.HonorariaSummaryReportResult;
import com.iqvia.tools.shared.model.AccountingSchema.MonthlyHonorariaReport;
import com.iqvia.tools.shared.model.AccountingSchema.ProgramEventOption;
import com.iqvia.tools.shared.model.ReferenceSchema.Code;

@Controller
@RequestMapping(value = "/honoraria")
public class HonorariaController {

	private static final Logger logger = Logger.getLogger(HonorariaController.class);

	@Autowired private HonorariaService honorariaService;
	@Autowired private SharedServices sharedServices;


	// First / Main Screen
	@RequestMapping(method = RequestMethod.GET)
	public String main(HttpSession session, Model model) {
		String view = "/tools/honoraria/honoraria-main";

		Authentication auth = SecurityContextHolder.getContext().getAuthentication();
		String name = auth.getName();
		session.setAttribute("authUser", name);
		LDAPPerson user = sharedServices.getLdapUserByUsername(name);
		session.setAttribute("authLdapUser", user);
		session.setAttribute("userFullName", user.getDisplayName());

		logger.debug("HonorariaController main: entering, user=" + user.getFullName());
	    if (PropertyUtil.getPropValue("honorariaMaintenanceMode").contentEquals("true")) {
	    	view = "index";
			model.addAttribute("message", "Honoraria is unavaiable at this time for upgrades.");
	    }
		
		return view;
	}

	// fulfillmentMethod, paymentTypeGroup
	
	@RequestMapping(value = "/check-for-incomplete-batch", method = RequestMethod.GET, produces = "application/json")
	@ResponseBody
	public OpenIncompleteCurResult checkForIncompleteBatch() {		
		return  honorariaService.checkForIncompleteBatch();
	}

	@RequestMapping(value = "/get-unprocessed-honoraria", method = RequestMethod.GET, produces = "application/json")
	@ResponseBody
	public HonorariaSearchResult getUnprocessedHonoraria(
			@RequestParam(value = "fulfillmentMethod", required = false) String fulfillmentMethod,
			@RequestParam(value = "paymentTypeGroup", required = false) String paymentTypeGroup,
			@RequestParam(value = "dueDate", required = false) String dueDate) {
		logger.info("Fetching unprocessed honoraria with filters: fulfillmentMethod=" + fulfillmentMethod + ", paymentTypeGroup=" + paymentTypeGroup + ", dueDate=" + dueDate);
		return  honorariaService.getUnprocessedHonoraria(fulfillmentMethod, paymentTypeGroup, dueDate);
	}
	
	
	@RequestMapping(value = "/get-earned-honoraria", method = RequestMethod.GET, produces = "application/json")
	@ResponseBody
	public HonorariaSearchResult getEarnedHonoraria(
			@RequestParam(value = "fulfillmentMethod", required = false) String fulfillmentMethod,
			@RequestParam(value = "paymentTypeGroup", required = false) String paymentTypeGroup,
			@RequestParam(value = "dueDate", required = false) String dueDate) {
		logger.info("Fetching earned honoraria with filters: fulfillmentMethod=" + fulfillmentMethod + ", paymentTypeGroup=" + paymentTypeGroup + ", dueDate=" + dueDate);
		return  honorariaService.getEanredHonoraria(fulfillmentMethod, paymentTypeGroup, dueDate);
	}
	
	
	@RequestMapping(value = "/generate-fulfillment-batch", method = RequestMethod.GET, produces = "application/json")
	@ResponseBody
	public HonorariaSearchResult generateFulfillmentBatch(
			@RequestParam(value = "fulfillmentMethod", required = false) String fulfillmentMethod,
			@RequestParam(value = "paymentTypeGroup", required = false) String paymentTypeGroup,
			@RequestParam(value = "dueDate", required = false) String dueDate,
			@RequestParam(value = "businessLineId") long businessLineId) {
		Authentication auth = SecurityContextHolder.getContext().getAuthentication();
		String userName = auth.getName();

		return honorariaService.generateFulfillmentBatch(fulfillmentMethod, paymentTypeGroup, dueDate, businessLineId, userName);
	}


	@RequestMapping(value = "/generate-fulfillment-batches", method = RequestMethod.GET, produces = "application/json")
	@ResponseBody
	public HonorariaSearchResult generateFulfillmentBatches(
			@RequestParam(value = "fulfillmentMethod", required = false) String fulfillmentMethod,
			@RequestParam(value = "paymentTypeGroup", required = false) String paymentTypeGroup,
			@RequestParam(value = "dueDate", required = false) String dueDate,
			@RequestParam(value = "businessLineIds", required = false) long[] businessLineIds,
			@RequestParam(value = "batchCutoffAmounts", required = false) String[] batchCutoffAmounts) {
		Authentication auth = SecurityContextHolder.getContext().getAuthentication();
		String userName = auth.getName();

		return honorariaService.generateFulfillmentBatches(
				fulfillmentMethod, paymentTypeGroup, dueDate, userName, businessLineIds, batchCutoffAmounts);
	}
	

	@RequestMapping(value = "/generate-file", method = RequestMethod.GET, produces = "application/json")
	@ResponseBody
	public boolean generateFile(@RequestParam(value = "batchId") long batchId, @RequestParam(value = "proposedFulfillmentDate", required = false) String proposedFulfillmentDate) {
		Authentication auth = SecurityContextHolder.getContext().getAuthentication();
		String userName = auth.getName();
		return honorariaService.generateFile(batchId, userName, proposedFulfillmentDate);
	}
	

	@RequestMapping(value = "/generate-files", method = RequestMethod.GET, produces = "application/json")
	@ResponseBody
	public boolean generateFiles(@RequestParam(value = "batchIds") String[] batchIds, @RequestParam(value = "proposedFulfillmentDate", required = false) String proposedFulfillmentDate) {
		Authentication auth = SecurityContextHolder.getContext().getAuthentication();
		String userName = auth.getName();
		return honorariaService.generateFiles(batchIds, userName, proposedFulfillmentDate);

	}
	

	@RequestMapping(value = "/run-loopback", method = RequestMethod.GET, produces = "application/json")
	@ResponseBody
	public boolean runLoopback(@RequestParam long batchId, @RequestParam(required = false) String orderNumber) {
		Authentication auth = SecurityContextHolder.getContext().getAuthentication();
		String userName = auth.getName();
		return honorariaService.runLoopback(batchId, userName, orderNumber);
	}
	
	
	@RequestMapping(value = "/get-checks-by-number", method = RequestMethod.GET, produces = "application/json")
	@ResponseBody
	public List<CheckRepository> getChecksByNumber(@RequestParam(required = false) String checkNo) {
		return  honorariaService.getChecksByNumber(checkNo);
	}

	
	@RequestMapping(value = "/get-checks-by-trxid", method = RequestMethod.GET, produces = "application/json")
	@ResponseBody
	public List<CheckRepository> getChecksByTargetrxId(@RequestParam(required = false) Long trxid) {
		return  honorariaService.getChecksByTargetrxId(trxid);
	}
	
	
	@RequestMapping(value = "/get-checks-by-dates", method = RequestMethod.GET, produces = "application/json")
	@ResponseBody
	public List<CheckRepository> getChecksByDates(
			@RequestParam(required = false) String fromDate,
			@RequestParam(required = false) String toDate) {	
		return honorariaService.getChecksByDates(fromDate, toDate);
	}

	
	@RequestMapping(value = "/get-stale-check-files", method = RequestMethod.GET, produces = "application/json")
	@ResponseBody
	public List<AdpStaleCheckFiles> getStaleCheckFiles() {	
		return honorariaService.getStaleCheckFiles();
	}

	@RequestMapping(value = "/get-stale-check-file-details", method = RequestMethod.GET, produces = "application/json")
	@ResponseBody
	public List<AdpStaleCheckFileDetail> getStaleCheckFileDetails(@RequestParam int fileId) {
		return honorariaService.getStaleCheckFileDetails(fileId);
	}

	
	// Uploads Excel file to server
	@RequestMapping(value = "/upload-check-file", method = RequestMethod.POST)
	public @ResponseBody
	String uploadCheckFile(HttpSession session, @RequestParam("file") MultipartFile file, Model model) {
		logger.info("upload check file = " + file.getOriginalFilename() + ", updUser=" + session.getAttribute("userFullName"));
		String msg = honorariaService.uploadFile(file, session);
		
		return msg;
	}

	@RequestMapping(value = "/add-checks-by-number", method = RequestMethod.GET, produces = "application/json")
	public @ResponseBody
	String addCheckByNumber(String[] allCheckNumbers) {		
		Authentication auth = SecurityContextHolder.getContext().getAuthentication();
		String userName = auth.getName();
		return honorariaService.addCheckByNumber(allCheckNumbers, userName);
	}


	@RequestMapping(value = "/add-checks-by-file", method = RequestMethod.GET, produces = "application/json")
	public @ResponseBody
	String addCheckByFile(String fileName) {		
		Authentication auth = SecurityContextHolder.getContext().getAuthentication();
		String userName = auth.getName();
		return honorariaService.addCheckByFile(fileName, userName);
	}


	
	@RequestMapping(value = "/get-activity-honoraria", method = RequestMethod.GET, produces = "application/json")
	public @ResponseBody
	List<ActivityHonoraria> getActivityHonoraria(Long programId) {		
		return honorariaService.getActivityHonoraria(programId);
	}

	
	@RequestMapping(value = "/get-honoraria-types-programs", method = RequestMethod.GET, produces = "application/json")
	public @ResponseBody
	List<HonorariaType> getHonorariaTypesByTrigger(String paymentTriggerTypeCode) {		
		return honorariaService.getHonorariaTypesByTrigger(paymentTriggerTypeCode);
	}

	
	@RequestMapping(value = "/save-approved-amount", method = RequestMethod.GET, produces = "application/json")
	@ResponseBody
	public int saveApprovedAmount(HttpSession session, @RequestParam String approvalRecs) {
		logger.info("saveApprovedAmount entering approvalRecs=" + approvalRecs + ", updUser=" + session.getAttribute("userFullName"));   

		return honorariaService.saveApprovedAmount(approvalRecs);		
	}

	@RequestMapping(value = "/get-honoraria-disposition-codes", method = RequestMethod.GET, produces = "application/json")
	@ResponseBody
	public List<Code> getHonorariaDispositionCodes() {
		return honorariaService.getHonorariaDispositionCodes();
	}

	@RequestMapping(value = "/get-program-events", method = RequestMethod.GET, produces = "application/json")
	@ResponseBody
	public List<ProgramEventOption> getProgramEvents(@RequestParam long programEventId) {
		return honorariaService.getProgramEvents(programEventId);
	}

	@RequestMapping(value = "/honoraria-summary-report", method = RequestMethod.GET, produces = "application/json")
	@ResponseBody
	public HonorariaSummaryReportResult getHonorariaSummaryReport(
			@RequestParam(required = false) Long targetrxId,
			@RequestParam(required = false) String approvedAmount,
			@RequestParam(required = false) String startDate,
			@RequestParam(required = false) String endDate,
			@RequestParam(required = false) Long programEventId,
			@RequestParam(required = false) Long eventId,
			@RequestParam(required = false) String honorariaStatus,
			@RequestParam(defaultValue = "false") boolean manualOnly,
			@RequestParam(required = false) String sortBy) {
		return honorariaService.searchHonorariaSummary(targetrxId, approvedAmount, startDate, endDate,
				programEventId, eventId, honorariaStatus, manualOnly, sortBy);
	}

	@RequestMapping(value = "/status-summary-report", method = RequestMethod.GET, produces = "application/json")
	@ResponseBody
	public HonorariaStatusSummaryReport getStatusSummaryReport() {
		return honorariaService.getStatusSummaryReport();
	}

	@RequestMapping(value = "/monthly-honoraria-report", method = RequestMethod.GET, produces = "application/json")
	@ResponseBody
	public MonthlyHonorariaReport getMonthlyHonorariaReport(
			@RequestParam String startDate,
			@RequestParam String endDate) {
		return honorariaService.getMonthlyHonorariaReport(startDate, endDate);
	}

	@RequestMapping(value = "/cells-by-programs", method = RequestMethod.GET, produces = "application/json")
	@ResponseBody
	public List<Integer> getCellsByPrograms(@RequestParam String programEventIds) {
		List<Long> ids = parseLongList(programEventIds);
		return honorariaService.getDistinctCellNumbers(ids);
	}

	@RequestMapping(value = "/honoraria-by-cell-report", method = RequestMethod.GET, produces = "application/json")
	@ResponseBody
	public HonorariaByCellReport getHonorariaByCellReport(
			@RequestParam String programEventIds,
			@RequestParam String cells) {
		List<Long> programIds = parseLongList(programEventIds);
		List<Integer> activeCells = parseIntList(cells);
		return honorariaService.getHonorariaByCellReport(programIds, activeCells);
	}

	@RequestMapping(value = "/honoraria-latency-report", method = RequestMethod.GET, produces = "application/json")
	@ResponseBody
	public HonorariaLatencyReport getHonorariaLatencyReport(
			@RequestParam String startDate,
			@RequestParam String endDate) {
		return honorariaService.getHonorariaLatencyReport(startDate, endDate);
	}

	private static List<Long> parseLongList(String csv) {
		if (csv == null || csv.trim().isEmpty()) {
			return Collections.emptyList();
		}
		return Arrays.stream(csv.split(","))
				.map(s -> s.trim())
				.filter(s -> !s.isEmpty())
				.map(Long::valueOf)
				.collect(Collectors.toList());
	}

	private static List<Integer> parseIntList(String csv) {
		if (csv == null || csv.trim().isEmpty()) {
			return Collections.emptyList();
		}
		return Arrays.stream(csv.split(","))
				.map(s -> s.trim())
				.filter(s -> !s.isEmpty())
				.map(Integer::valueOf)
				.collect(Collectors.toList());
	}
	
	
}

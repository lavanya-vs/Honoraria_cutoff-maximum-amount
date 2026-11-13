<!DOCTYPE html>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core"%>
<%@ taglib prefix="form" uri="http://www.springframework.org/tags/form"%>
<%@ taglib prefix="security" uri="http://www.springframework.org/security/tags"%>

<%@ page import="com.iqvia.tools.shared.constants.Constants, com.iqvia.tools.shared.utility.PropertyUtil" %>
<%@ page import="com.iqvia.tools.shared.utility.PropertyUtil" %>
<%@ page import="com.iqvia.tools.shared.model.LDAPPerson" %>

<% 
LDAPPerson authLdapUser = (LDAPPerson)session.getAttribute("authLdapUser");
String userName = authLdapUser.getAccountName();
String version = "?ver=" + PropertyUtil.getPropValue("version"); 
String honorariaUsers = PropertyUtil.getPropValue("honorariaUsers");
String tab1active = "";
String tab2active = "";

if ((honorariaUsers != null) && honorariaUsers.contains(userName)) {
	tab1active = "active";
} else {
	tab2active = "active";
}
%>

<html lang="en">
<head>
	<%@include file="../../shared/html_head_content.html"%>
	<link href="${pageContext.request.contextPath}/resources/css/tools/person-lookup.css<%=version%>" rel="stylesheet" type="text/css">
	<link href="${pageContext.request.contextPath}/resources/css/tools/honoraria.css<%=version%>" rel="stylesheet" type="text/css">
	<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-datepicker/1.7.1/css/bootstrap-datepicker3.min.css">
    <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css">
	<link rel="stylesheet" href="${pageContext.request.contextPath}/resources/css/dropzone.css">  
</head>

<body>
	<div id="wrapper">

		<jsp:include page="../../shared/header.jsp"></jsp:include>

		<section id="inner-headline">
			<div class="container">
				<div class="row">
					<div class="inner-heading">
					<h2>Honoraria Processing</h2>
					</div>
				</div>
			</div>
		</section>

		<section id="content">

			<div class="container">
				<!-- Tabs -->
				<ul class="nav nav-tabs bold" id="#pageTabs">
					<% if ((honorariaUsers != null) && honorariaUsers.contains(userName)) { %>
					<li class="<%= tab1active %> nav-item" id="processTab"><a href="#PROCESS_TAB" data-toggle="tab">Process</a></li>
					<li class="nav-item" id="voidTab"><a href="#VOID_TAB" data-toggle="tab">Void/Reissue</a></li>
					<li class="nav-item" id="checkTab"><a href="#CHECK_TAB" onclick='initCheckTab()' data-toggle="tab">Check Reconciliation</a></li>
					<% } %>
					<li class="<%= tab2active %> nav-item" id="summaryReportTab"><a href="#SUMMARY_REPORT_TAB" onclick="initSummaryReportTab()" data-toggle="tab">Honoraria Lookup</a></li>
					<li class="nav-item" id="statusSummaryTab"><a href="#STATUS_SUMMARY_TAB" onclick="loadStatusSummaryReport()" data-toggle="tab">Status Summary</a></li>
					<li class="nav-item" id="monthlyReportTab"><a href="#MONTHLY_REPORT_TAB" onclick="initMonthlyReportTab()" data-toggle="tab">Monthly Report</a></li>
					<li class="nav-item" id="byCellTab"><a href="#BY_CELL_TAB" onclick="initByCellTab()" data-toggle="tab">By Program</a></li>
					<li class="nav-item" id="latencyReportTab"><a href="#LATENCY_REPORT_TAB" onclick="initLatencyReportTab()" data-toggle="tab">Latency Report</a></li>
				</ul>

				<div class="tab-content">
					<!-- Home Search -->
					<div class="tab-pane <%= tab1active %>" id="PROCESS_TAB">

						<div class="row tab-row" id="searchHonRow">						
							<div class="span2">
								<h5>Search Honoraria:</h5>
							</div>
							<div class="span2">
								<label class="control-label" for="dueDate">Due Date:</label>
								<div class="input-group date" data-date-format="mm/dd/yyyy">
									<input type="text" class="form-control" id="dueDate" placeholder="mm/dd/yyyy">
									<div class="input-group-addon" >
									<span class="glyphicon glyphicon-th"></span>
									</div>
								</div>
							</div>

							<div class="span3">							
								<label class="control-label" for="paymentTypeFilter">Fulfillment Method:</label>
								<select id="fulfillmentMethod" class="form-control">
									<option value="">Select Fulfillment Method</option>
									<option value="CHECK">Check</option>
									<option value="AMAZON">Fulfillment by Amazon</option>			
								</select>		
							</div>

							<div class="span3">							
								<label class="control-label" for="paymeTypeFilter">Program Type:</label>
								<select id="paymentTypeGroup" class="form-control">
									<option value="">Program Type</option>
									<option value="All">All</option>
									<option value="EDC Payments">EDC Payments</option>
									<option value="Survey Payments">Survey Payments</option>
									<option value="Survey+POP Payments">Survey+POP Payments</option>
								</select>
							</div>

							<div class="span2">
								<center><a id="search-btn" onclick="searchUnprocessed()" class="btn btn-primary" style="margin-top:25px;width:200px;">SEARCH</a></center>
							</div>
						</div>

						<div class="row tab-row" id="messageSec" style="display:none">
							<div class="span2">
								<h5>Message:</h5>
							</div>
							<div class="span10">
								<div id="resultMsg" class='alert alert-danger' role='alert'></div>
							</div>
						</div>
									
						<div class="row tab-row" id="searchResults" style="display:none;">
							<div class="span2">
								<h5>Fulfillments:</h5>
							</div>
							<div class="span9">
								<div class="tableFixHead">
									<table class="table table-bordered">
										<thead class="thead-dark">
											<tr> 
											<th scope="col" style="width:60px;">Business Line</th>
											<th scope="col" style="width:40px;">Finance Code</th>
											<th scope="col" style="width:20px;">Fulfillments</th>
											<th scope="col" style="width:20px;">Amount</th>
											<th scope="col" style="width:120px;">Cutoff (max)</th>
											<th scope="col" style="width:10px;">Action</th>
											</tr>
										</thead>
										<tbody id="searchResultsTableBody">
										</tbody>
									</table>
									<p class="hon-cutoff-help">Optional maximum amount per business line. Leave blank to fulfill the full amount.</p>
								</div>
							</div>
						</div>
						

						<div class="row tab-row" id="earnedResults" style="display:none;">
							<div class="span2">
								<h5>Batches:</h5>
							</div>
							<div class="span9">
								<div class="tableFixHead">
									<table class="table table-bordered">
										<thead class="thead-dark">
											<tr> 
											<th scope="col" style="width:20px;">Batch Id</th>
											<th scope="col" style="width:60px;">Business Line</th>
											<th scope="col" style="width:40px;">Finance Code</th>
											<th scope="col" style="width:20px;">Fulfillments</th>
											<th scope="col" style="width:20px;">Amount</th>
											<th scope="col" style="width:20px;">Action</th>
											</tr>
										</thead>
										<tbody id="earnedResultsTableBody">
										</tbody>
									</table>									
								</div>
							</div>
						</div>

						<div class="row tab-row hon-incomplete-panel" id="incompleteResults">
							<div class="span2">
								<h5>Incomplete Batches:</h5>
							</div>
							<div class="span9">
								<div class="hon-incomplete-toolbar">
									<p id="incompleteStatusText" class="hon-status-text">Checking Oracle for incomplete batches...</p>
									<div class="hon-incomplete-toolbar-actions">
										<span id="incompleteLastUpdated" class="hon-last-updated"></span>
										<a id="refreshIncompleteBtn" class="btn btn-default btn-sm hon-refresh-btn" href="#" role="button">Refresh</a>
									</div>
								</div>
								<div id="incompleteEmptyState" class="hon-empty-state is-loading">Loading incomplete batches from Oracle...</div>
								<div id="incompleteTableWrap" class="tableFixHead hon-incomplete-table-wrap" style="display:none;">
									<table class="table table-bordered table-hover">
										<thead class="thead-dark">
											<tr>
												<th scope="col" style="width:20px;">Batch Id</th>
												<th scope="col" style="width:60px;">Business Line</th>
												<th scope="col" style="width:40px;">Finance Code</th>
												<th scope="col" style="width:20px;">Fulfillments</th>
												<th scope="col" style="width:20px;">Amount</th>
												<th scope="col" style="width:20px;">Status</th>
												<th scope="col" style="width:20px;">Action</th>
											</tr>
										</thead>
										<tbody id="incompleteResultsTableBody">
										</tbody>
									</table>
								</div>
							</div>
						</div>

					</div> <!-- end search tab -->


					<!-- Void Honoraria -->
					<div class="tab-pane" id="VOID_TAB">
						<h3 class="honHeader">Void Honoraria</h3>
						
						<div class="row tab-row" style="">
							<div class="span6">
								<h5>Search For Checks</h5>
								<label class="control-label" for="checkNo">Check Number</label>
								<input type="text" id="checkNo" />								
								<a id="search-btn" onclick="findChecksByNo()" class="btn btn-primary" style="margin-top:-10px;width:50px;">SEARCH</a>

								<label class="control-label" for="trxid">TargetRx Id</label>
								<input type="text" id="trxid" />								
								<a id="search-btn" onclick="findChecksByTrxid()" class="btn btn-primary" style="margin-top:-10px;width:50px;">SEARCH</a>
							</div>

							
							<div class="span6">
								<h5>Search For Voided Checks</h5>
								
								<label class="control-label" for="fromDate">From Date:</label>
								<div class="input-group date" data-date-format="mm/dd/yyyy">
									<input type="text" class="form-control" id="fromDate" placeholder="mm/dd/yyyy">
									<div class="input-group-addon" >
									<span class="glyphicon glyphicon-th"></span>
									</div>
								</div>

								<label class="control-label" for="toDate">To Date:</label>
								<div class="input-group date" data-date-format="mm/dd/yyyy">
									<input type="text" class="form-control" id="toDate" placeholder="mm/dd/yyyy">
									<div class="input-group-addon" >
									<span class="glyphicon glyphicon-th"></span>
									</div>
								</div>
								
								<a id="search-btn" onclick="findChecksByDates()" class="btn btn-primary" style="margin-top:0px;width:50px;">SEARCH</a></center>

								
							</div>
						</div>

						
						<div class="row tab-row" id="voidSearchResults" style="display:none;">
							<div class="span12">
								<h4 style="margin-bottom:5px;" id="voidResultsHeader"></h4>
								<a id="voidExportBtn" class="btn btn-primary" style="float:right;margin-top:-25px;width:100px;">Excel Export</a>
								<div class="tableFixHead">
									<table id="voidSearchResultsTable" class="table table-bordered">
										<thead class="thead-dark">
											<tr> 
											<th scope="col" style="width:40px;">Action</th>
											<th scope="col">Check No</th>
											<th scope="col">Amount</th>
											<th scope="col">Loaded Date</th>
											<th scope="col">Voided Date</th>
											<th scope="col">Claim No.</th>
											<th scope="col">Remarks</th>
											<th scope="col" class="optCol" style="display:none;">User</th>
											<th scope="col" class="optCol" style="display:none;">TargetRx Id</th>
											</tr>
										</thead>
										<tbody id="voidSearchResultsTableBody">
										</tbody>
									</table>									
								</div>
							</div>
						</div>
						
						<div class="span8" style="padding-top:10px;">
							<div id="voidNoResultMsg" style="display:none;" class='alert alert-danger' role='alert'></div>							
						</div>

					</div>
					
					<!-- Checks -->
					<div class="tab-pane" id="CHECK_TAB">
						<h3 class="honHeader">Check Reconciliation</h3>
						
											
						<div class="row tab-row">
							<div class="span5">							
								<label class="control-label" for="checks">Type or paste in a list of check numbers separated by commas:</label>
								<textarea id="checkNumbersDelim" style="width: 440px; height: 150px;"></textarea>
								<center><a onclick="processCheckData()" class="btn btn-primary" style="margin-top:0px;width:120px;">Submit Check Data</a></center>
								<div id="checkNumbersMsg" style="display:none;margin-top:5px;" class='alert alert-danger' role='alert'></div>							
							</div>

							<div class="span6">							
								<label class="control-label" for="checkFileToLoad">Or, upload an Excel File:</label>
								<form action="${pageContext.request.contextPath}/honoraria/upload-check-file" class="dropzone" id="checkFileToLoad" style="padding:0px;width:175px;">
									<input type="hidden" id="dropzone_check_filename" />								
								</form>																		
								<a onclick="processCheckFile()" class="btn btn-primary" style="margin-top:0px;width:150px;">Submit File Check Data</a>
								<div id="uploadMsg" style="display:none;margin-top:5px;" class='alert alert-danger' role='alert'></div>							
							</div>
						</div>						
						
						<div class="row tab-row">
							<div class="span8">							
								<label class="control-label" for="previousLoads">View previous loads:</label>
								<select id="previousLoads" class="selectpicker" data-size="8" data-live-search="true" data-dropup-auto="true">
								</select>		
							</div>
						</div>

						<div class="row tab-row" id="checksResults" style="display:none;">
							<div class="span12">
								<h4 style="margin-bottom:5px;" id="checksResultsHeader"></h4>
								<a id="checkExportBtn" class="btn btn-primary" style="float:right;margin-top:-25px;width:100px;">Excel Export</a>
								<div class="tableFixHead">
									<table id="checksSearchResultsTable" class="table table-bordered">
										<thead class="thead-dark">
											<tr> 
											<th scope="col">Check No</th>
											<th scope="col">Check Date</th>
											<th scope="col">Check Amount</th>
											<th scope="col">Check Payee Name</th>
											<th scope="col">Check Payee Address 1</th>
											<th scope="col">Check Payee Address 2</th>
											<th scope="col">Check Payee Address 3</th>
											<th scope="col">TargetRx Id</th>
											<th scope="col">SalesLogix Id</th>
											<th scope="col">Payee First Name</th>
											<th scope="col">Payee MI</th>
											<th scope="col">Payee Last Name</th>
											<th scope="col">Payee Address 1</th>
											<th scope="col">Payee Address 2</th>
											<th scope="col">Payee City</th>
											<th scope="col">Payee State</th>
											<th scope="col">Payee Postal Code</th>
											<th scope="col">Reissue Date</th>
											<th scope="col">Reissue Check Number</th>
											<th scope="col">Reissue Check Date</th>
											<th scope="col">Reissue Check Amount</th>
											</tr>
										</thead>
										<tbody id="checksSearchResultsTableBody">
										</tbody>
									</table>									
								</div>
							</div>
						</div>
						
					</div>


					<!-- Honoraria Summary Report -->
					<div class="tab-pane <%= tab2active %>" id="SUMMARY_REPORT_TAB">
						<h3 class="honHeader">Honoraria Summary Report</h3>
						<div class="row tab-row">
							<div class="span12">
								<jsp:include page="/WEB-INF/views/tools/programSearch.jsp">
									<jsp:param name="dbName" value="ACTION"/>
									<jsp:param name="elementId" value="honSumReportProgram"/>									
								</jsp:include>
							</div>
						</div>
						<div class="row tab-row">
							<div class="span3">
								<label class="control-label" for="summaryEventId">Event</label>
								<select id="summaryEventId" class="form-control">
									<option value="">ALL EVENTS</option>
								</select>
							</div>
							<div class="span3">
								<label class="control-label" for="summaryHonorariaStatus">Honoraria Status</label>
								<select id="summaryHonorariaStatus" class="form-control">
									<option value="">SHOW ALL</option>
								</select>
							</div>
						</div>
						<div class="row tab-row">
							<div class="span3">
								<label class="control-label" for="summaryTargetrxId">TargetRx ID</label>
								<input type="text" id="summaryTargetrxId" class="form-control"/>
							</div>
							<div class="span3">
								<label class="control-label" for="summaryApprovedAmount">Honoraria Amount</label>
								<input type="text" id="summaryApprovedAmount" class="form-control"/>
							</div>
							<div class="span3">
								<label class="control-label" for="summaryStartDate">Start Date</label>
								<div class="input-group date" data-date-format="mm/dd/yyyy">
									<input type="text" class="form-control" id="summaryStartDate" placeholder="mm/dd/yyyy">
									<div class="input-group-addon"><span class="glyphicon glyphicon-th"></span></div>
								</div>
							</div>
							<div class="span3">
								<label class="control-label" for="summaryEndDate">End Date</label>
								<div class="input-group date" data-date-format="mm/dd/yyyy">
									<input type="text" class="form-control" id="summaryEndDate" placeholder="mm/dd/yyyy">
									<div class="input-group-addon"><span class="glyphicon glyphicon-th"></span></div>
								</div>
							</div>
						</div>
						<div class="row tab-row">
							<div class="span6">
								<label><input type="checkbox" id="summaryManualOnly" value="1"/> Show only manually entered honoraria</label>
							</div>
							<div class="span3">
								<a onclick="searchHonorariaSummary()" class="btn btn-primary">Submit</a>
							</div>
						</div>
						<div class="row tab-row" id="summaryReportResults" style="display:none;">
							<div class="span12">
								<a id="summaryExportBtn" class="btn btn-primary" style="float:right;width:100px;">Excel Export</a>
								<div class="tableFixHead">
									<table id="summaryReportTable" class="table table-bordered">
										<thead class="thead-dark">
											<tr>
												<th scope="col">TargetRx ID</th>
												<th scope="col">Name</th>
												<th scope="col">Program</th>
												<th scope="col">Event</th>
												<th scope="col">Earned Date</th>
												<th scope="col">Amount</th>
												<th scope="col">Status</th>
												<th scope="col">Fulfillment Status</th>
											</tr>
										</thead>
										<tbody id="summaryReportTableBody"></tbody>
									</table>
								</div>
								<p id="summaryReportTotals" class="bold"></p>
							</div>
						</div>
					</div>

					<!-- Status Summary Report -->
					<div class="tab-pane" id="STATUS_SUMMARY_TAB">
						<h3 class="honHeader">Summary By Status</h3>
						<div id="statusSummaryContent"></div>
					</div>

					<!-- Monthly Honoraria Report -->
					<div class="tab-pane" id="MONTHLY_REPORT_TAB">
						<h3 class="honHeader">Monthly Honoraria Report</h3>
						<div class="row tab-row">
							<div class="span3">
								<label class="control-label" for="monthlyStartDate">Start Date</label>
								<div class="input-group date" data-date-format="mm/dd/yyyy">
									<input type="text" class="form-control" id="monthlyStartDate" placeholder="mm/dd/yyyy">
									<div class="input-group-addon"><span class="glyphicon glyphicon-th"></span></div>
								</div>
							</div>
							<div class="span3">
								<label class="control-label" for="monthlyEndDate">End Date</label>
								<div class="input-group date" data-date-format="mm/dd/yyyy">
									<input type="text" class="form-control" id="monthlyEndDate" placeholder="mm/dd/yyyy">
									<div class="input-group-addon"><span class="glyphicon glyphicon-th"></span></div>
								</div>
							</div>
							<div class="span3">
								<a onclick="compileMonthlyReport()" class="btn btn-primary" style="margin-top:25px;">Compile Report</a>
							</div>
						</div>
						<div class="row tab-row">
							<div class="span6" id="monthlyWeekLinks"></div>
							<div class="span6" id="monthlyMonthLinks"></div>
						</div>
						<div id="monthlyReportContent"></div>
					</div>

					<!-- Honoraria By Cell -->
					<div class="tab-pane" id="BY_CELL_TAB">
						<h3 class="honHeader">Program Honoraria Summary Report</h3>

						<div class="row tab-row">
							<div class="span12">
								<jsp:include page="/WEB-INF/views/tools/programSearch.jsp">
									<jsp:param name="dbName" value="ACTION"/>
									<jsp:param name="elementId" value="honProgReportProgram"/>									
									<jsp:param name="options" value="multiple"/>									
								</jsp:include>
							</div>
						</div>

						<div class="row tab-row" id="byCellConfigRow" style="display:none;">
							<div class="span8" id="byCellCellSelectors"></div>
							<div class="span4">
								<a onclick="compileByCellReport()" class="btn btn-primary" style="margin-top:25px;">Compile Report</a>
							</div>
						</div>
						
						<div class="row tab-row" id="byCellResults" style="display:none;">
							<div class="span12">
								<div class="tableFixHead">
									<table id="byCellReportTable" class="table table-bordered">
										<thead class="thead-dark">
											<tr>
												<th scope="col">Project</th>
												<th scope="col">Cell</th>
												<th scope="col">Doctors</th>
												<th scope="col">Manual Honoraria</th>
												<th scope="col">Regular Honoraria</th>
												<th scope="col">Total Honoraria</th>
											</tr>
										</thead>
										<tbody id="byCellReportTableBody"></tbody>
										<tfoot id="byCellReportTableFoot"></tfoot>
									</table>
								</div>
							</div>
						</div>
					</div>

					<!-- Honoraria Latency Report -->
					<div class="tab-pane" id="LATENCY_REPORT_TAB">
						<h3 class="honHeader">Honoraria Latency Report</h3>
						<div class="row tab-row">
							<div class="span3">
								<label class="control-label" for="latencyStartDate">Start Date</label>
								<div class="input-group date" data-date-format="mm/dd/yyyy">
									<input type="text" class="form-control" id="latencyStartDate" placeholder="mm/dd/yyyy">
									<div class="input-group-addon"><span class="glyphicon glyphicon-th"></span></div>
								</div>
							</div>
							<div class="span3">
								<label class="control-label" for="latencyEndDate">End Date</label>
								<div class="input-group date" data-date-format="mm/dd/yyyy">
									<input type="text" class="form-control" id="latencyEndDate" placeholder="mm/dd/yyyy">
									<div class="input-group-addon"><span class="glyphicon glyphicon-th"></span></div>
								</div>
							</div>
							<div class="span3">
								<a onclick="compileLatencyReport()" class="btn btn-primary" style="margin-top:25px;">Compile Report</a>
							</div>
						</div>
						<div class="row tab-row">
							<div class="span6" id="latencyWeekLinks"></div>
							<div class="span6" id="latencyMonthLinks"></div>
						</div>
						<div id="latencyReportContent"></div>
					</div>


				</div> <!-- end tabs -->
			</div>
		</section>

		<jsp:include page="../../shared/footer.jsp"></jsp:include>
		<jsp:include page="../../shared/js_resources.jsp"></jsp:include>

	</div> <!-- END: wrapper -->

	<script src="${pageContext.request.contextPath}/resources/js/dropzone.js"></script>
	<script src="${pageContext.request.contextPath}/resources/js/tools/honoraria/honoraria.js<%=version%>"></script>
	<script src="${pageContext.request.contextPath}/resources/js/tools/list_management/programSearch.js<%=version%>"></script>
	<script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-datepicker/1.7.1/js/bootstrap-datepicker.min.js"></script>
	<script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-datepicker/1.7.1/locales/bootstrap-datepicker.en-GB.min.js" charset="UTF-8"></script>

</body>
</html>